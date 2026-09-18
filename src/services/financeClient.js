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
    if (error?.name === "AbortError") throw new HttpError(504, "UMA Finance API timed out.");
    throw new HttpError(502, "Unable to reach UMA Finance API.", error?.message);
  } finally {
    clearTimeout(timer);
  }
}

async function login() {
  const { response, body } = await fetchJson(`${config.financeApiBaseUrl}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email: config.financeServiceEmail,
      password: config.financeServicePassword
    })
  });

  if (!response.ok || !body?.token) {
    throw new HttpError(502, "Management gateway could not authenticate to UMA Finance.");
  }

  const actualRole = String(body?.user?.role || "").toUpperCase();
  if (actualRole !== config.financeRequiredRole) {
    throw new HttpError(500, `Configured service account must have role ${config.financeRequiredRole}.`);
  }

  accessToken = body.token;
  const expiry = decodeJwtExpiry(accessToken);
  tokenExpiresAt = expiry || Date.now() + 30 * 60 * 1000;
  return accessToken;
}

async function getToken() {
  if (accessToken && tokenExpiresAt - Date.now() > 5 * 60 * 1000) return accessToken;
  if (!loginPromise) {
    loginPromise = login().finally(() => { loginPromise = null; });
  }
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
    headers: {
      authorization: `Bearer ${token}`,
      accept: "application/json"
    }
  });

  if (response.status === 401 && retry) {
    accessToken = null;
    tokenExpiresAt = 0;
    return financeGet(path, params, false);
  }

  if (!response.ok) {
    throw new HttpError(response.status >= 500 ? 502 : response.status, body?.message || "UMA Finance API request failed.");
  }
  return body;
}

export async function financeHealth() {
  const base = config.financeApiBaseUrl.replace(/\/api$/, "");
  const { response, body } = await fetchJson(`${base}/health`, { method: "GET", headers: { accept: "application/json" } });
  if (!response.ok) throw new HttpError(502, "UMA Finance health check failed.");
  return body;
}

export async function financeReadiness() {
  const [health] = await Promise.all([
    financeHealth(),
    getToken()
  ]);
  return {
    health,
    authenticated: true,
    role: config.financeRequiredRole
  };
}
