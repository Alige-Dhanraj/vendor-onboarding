// A small per-key rate limit for the public vendor-link endpoints, so one link cannot be used to run up AI costs.
// It lives in the memory of one server instance, which is enough to stop casual abuse, not a determined attacker.
const hits = new Map<string, number[]>();

export function allow(key: string, max: number, windowMs: number, now = Date.now()): boolean {
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= max) { hits.set(key, recent); return false; }
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((t) => now - t < windowMs)) hits.delete(k);
  return true;
}

export const TOO_MANY = "Too many tries in a short time. Please wait a few minutes and try again.";
