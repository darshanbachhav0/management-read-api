import crypto from "node:crypto";
import { config } from "../config.js";

const expectedHashes = config.viewerApiKeys.map((key) => crypto.createHash("sha256").update(key).digest());

function hash(value) {
  return crypto.createHash("sha256").update(value).digest();
}

function matches(candidate) {
  if (!candidate) return false;
  const candidateHash = hash(candidate);
  return expectedHashes.some((expected) => expected.length === candidateHash.length && crypto.timingSafeEqual(expected, candidateHash));
}

export function apiKeyAuth(req, res, next) {
  const headerKey = String(req.get("x-api-key") || "").trim();
  const authorization = String(req.get("authorization") || "");
  const bearerKey = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  const candidate = headerKey || bearerKey;

  if (!matches(candidate)) {
    res.status(401).json({ error: "Unauthorized", message: "A valid read-only API key is required." });
    return;
  }
  next();
}
