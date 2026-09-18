import "dotenv/config";

function required(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function positiveInteger(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer.`);
  return value;
}

function csv(name) {
  return String(process.env[name] || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

const financeApiBaseUrl = required("FINANCE_API_BASE_URL").replace(/\/+$/, "");
if (!/^https?:\/\//i.test(financeApiBaseUrl)) {
  throw new Error("FINANCE_API_BASE_URL must start with http:// or https://");
}

export const config = Object.freeze({
  port: positiveInteger("PORT", 8088),
  nodeEnv: process.env.NODE_ENV || "development",
  viewerApiKeys: csv("VIEWER_API_KEYS"),
  allowedOrigins: csv("ALLOWED_ORIGINS"),
  rateLimitPerMinute: positiveInteger("RATE_LIMIT_PER_MINUTE", 120),
  cacheTtlMs: positiveInteger("CACHE_TTL_SECONDS", 30) * 1000,
  requestTimeoutMs: positiveInteger("REQUEST_TIMEOUT_MS", 10000),
  financeApiBaseUrl,
  financeServiceEmail: required("FINANCE_SERVICE_EMAIL"),
  financeServicePassword: required("FINANCE_SERVICE_PASSWORD"),
  financeRequiredRole: String(process.env.FINANCE_REQUIRED_ROLE || "MANAGEMENT").trim().toUpperCase()
});

if (!config.viewerApiKeys.length) {
  throw new Error("VIEWER_API_KEYS must contain at least one API key.");
}
