// Minimal in-memory fixed-window rate limiter (IN-PROOFCLIP-017 /
// T-PROOFCLIP-V067-005). This is an abuse guard, not a hard quota: it lives
// in one isolate and Cloudflare may run several, so it bounds single-isolate
// burst traffic only. Responses built from it never include request content,
// credentials or captured evidence.

export function createRateLimiter({ windowMs = 60_000, limit = 30, maxEntries = 2_000, now = () => Date.now() } = {}) {
  const counts = new Map();
  function prune(time) {
    for (const [key, entry] of counts) {
      if (time - entry.resetAt >= windowMs) counts.delete(key);
    }
  }
  return {
    hit(key) {
      const time = now();
      prune(time);
      const entry = counts.get(key);
      if (!entry || time - entry.resetAt >= windowMs) {
        if (!entry && counts.size >= maxEntries) counts.delete(counts.keys().next().value);
        counts.set(key, { count: 1, resetAt: time });
        return { allowed: true, remaining: limit - 1 };
      }
      if (entry.count >= limit) {
        return { allowed: false, remaining: 0, retryAfterMs: Math.max(0, windowMs - (time - entry.resetAt)) };
      }
      entry.count += 1;
      return { allowed: true, remaining: limit - entry.count };
    },
    reset(key) {
      counts.delete(key);
    },
    size() {
      return counts.size;
    }
  };
}
