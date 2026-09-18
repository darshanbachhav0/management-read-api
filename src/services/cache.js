import { config } from "../config.js";

const entries = new Map();
const MAX_ENTRIES = 100;

export async function cached(key, loader) {
  const now = Date.now();
  const existing = entries.get(key);
  if (existing && existing.expiresAt > now) return existing.value;

  const value = await loader();
  entries.set(key, { value, expiresAt: now + config.cacheTtlMs });

  if (entries.size > MAX_ENTRIES) {
    const first = entries.keys().next().value;
    entries.delete(first);
  }
  return value;
}

export function clearCache() {
  entries.clear();
}
