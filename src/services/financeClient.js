import { config } from "../config.js";
import { HttpError } from "../utils/httpError.js";

let accessToken = null;
let tokenExpiresAt = 0;
let loginPromise = null;

function decodeJwtExpiry(token) {
  try {
    const payload = token.split(".")[1];
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const decoded = JSON.parse(Buffer.from(normalized, "base64").toString("utf8"));
    return Number(decoded.exp || 0) * 1000;
  } catch {
    return 0;
  }
}

function connectionHint(error) {
  const cause = String(error?.cause?.message || error?.message || "").toLowerCase();
  if (config.nodeEnv === "production" && config.financeUsesLocalhost) {
    return "FINANCE_API_BASE_URL points to localhost. Render cannot reach a Finance backend running on your computer. Use the deployed Finance backend URL.";
  }
  if (cause.includes("enotfound") || cause.includes("getaddrinfo")) {
    return "The Finance backend hostname could not be resolved. Check FINANCE_API_BASE_URL in Render.";
  }
  if (cause.includes("econnrefused") || cause.includes("fetch failed")) {
    return "The Finance backend did not accept the connection. Confirm that it is deployed, running, and publicly/private-network reachable from Render.";
  }
  return "Check FINANCE_API_BASE_URL, confirm the Finance backend is deployed, and verify that its /health endpoint is reachable from Render.";
}

async function fetchJson(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.requestTimeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const text = await response.text();
    let body = null;
    if (text) {
      try { body = JSON.parse(text); } catch { body = { message: text }; }
    }
    return { response, body };
  } catch (error) {
    if (error?.name === "AbortError") {
      const timeout = new HttpError(504, "UMA Finance API timed out.");
      timeout.hint = "Increase REQUEST_TIMEOUT_MS only after confirming the Finance backend is healthy.";
      throw timeout;
    }
    const gatewayError = new HttpError(502, "Unable to reach UMA Finance API.");
    gatewayError.hint = connectionHint(error);
    gatewayError.causeCode = error?.cause?.code || error?.code || null;
    throw gatewayError;
  } finally {
    clearTimeout(timer);
  }
}

async function login() {
  if (config.nodeEnv === "production" && config.financeUsesLocalhost) {
    const error = new HttpError(502, "Finance backend URL is not reachable from Render.");
    error.hint = "Set FINANCE_API_BASE_URL to the deployed Finance backend, for example https://your-finance-backend.onrender.com. The /api suffix is optional.";
    throw error;
  }

  const { response, body } = await fetchJson(`${config.financeApiBaseUrl}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      email: config.financeServiceEmail,
      password: config.financeServicePassword
    })
  });

  if (!response.ok || !body?.token) {
    const message = response.status === 401
      ? "Management service-account credentials were rejected by UMA Finance."
      : `Management gateway could not authenticate to UMA Finance (${response.status}).`;
    const error = new HttpError(502, message);
    error.hint = response.status === 401
      ? "Check FINANCE_SERVICE_EMAIL and FINANCE_SERVICE_PASSWORD in Render, and confirm that the account is active."
      : "Confirm the Finance backend login endpoint is /api/auth/login and inspect the Finance backend logs.";
    throw error;
  }

  const actualRole = String(body?.user?.role || "").toUpperCase();
  if (actualRole !== config.financeRequiredRole) {
    const error = new HttpError(500, `Configured service account must have role ${config.financeRequiredRole}.`);
    error.hint = `The authenticated account returned role ${actualRole || "UNKNOWN"}. Use a dedicated Management account.`;
    throw error;
  }

  accessToken = body.token;
  const expiry = decodeJwtExpiry(accessToken);
  tokenExpiresAt = expiry || Date.now() + 30 * 60 * 1000;
  return accessToken;
}

async function getToken() {
  if (accessToken && tokenExpiresAt - Date.now() > 5 * 60 * 1000) return accessToken;
  if (!loginPromise) loginPromise = login().finally(() => { loginPromise = null; });
  return loginPromise;
}

function buildUrl(path, params = {}) {
  const url = new URL(`${config.financeApiBaseUrl}${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
  }
  return url;
}

export async function financeGet(path, params = {}, retry = true) {
  const token = await getToken();
  const { response, body } = await fetchJson(buildUrl(path, params), {
    method: "GET",
    headers: { authorization: `Bearer ${token}`, accept: "application/json" }
  });

  if (response.status === 401 && retry) {
    accessToken = null;
    tokenExpiresAt = 0;
    return financeGet(path, params, false);
  }

  if (!response.ok) {
    const error = new HttpError(response.status >= 500 ? 502 : response.status, body?.message || "UMA Finance API request failed.");
    error.hint = `Upstream returned HTTP ${response.status} for ${path}. Check the Finance backend logs and the Management account permissions.`;
    throw error;
  }
  return body;
}

export async function financeHealth() {
  if (config.nodeEnv === "production" && config.financeUsesLocalhost) {
    const error = new HttpError(502, "Finance backend URL is configured as localhost.");
    error.hint = "Render cannot access services on your Windows PC through localhost. Deploy the Finance backend and use its public URL or Render private-network hostname.";
    throw error;
  }
  const { response, body } = await fetchJson(`${config.financeOriginBaseUrl}/health`, {
    method: "GET",
    headers: { accept: "application/json" }
  });
  if (!response.ok) {
    const error = new HttpError(502, `UMA Finance health check returned HTTP ${response.status}.`);
    error.hint = `Expected a successful health endpoint at ${config.financeOriginBaseUrl}/health.`;
    throw error;
  }
  return body;
}

export async function financeReadiness() {
  try {
    const health = await financeHealth();
    await getToken();
    return {
      reachable: true,
      authenticated: true,
      role: config.financeRequiredRole,
      upstream: new URL(config.financeOriginBaseUrl).host,
      apiPath: new URL(config.financeApiBaseUrl).pathname || "/api",
      health
    };
  } catch (error) {
    return {
      reachable: false,
      authenticated: false,
      upstream: (() => { try { return new URL(config.financeOriginBaseUrl).host; } catch { return "not-configured"; } })(),
      apiPath: (() => { try { return new URL(config.financeApiBaseUrl).pathname || "/api"; } catch { return "/api"; } })(),
      message: error?.message || "Finance backend is not ready.",
      hint: error?.hint || "Check the Finance backend configuration.",
      status: Number(error?.status || 502)
    };
  }
}
