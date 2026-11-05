/**
 * Small in-memory fixed-window limiter for the public write/LLM routes.
 *
 * This is deliberately not a distributed limiter: on Vercel each instance has
 * its own map. It raises the cost of a trivial script and caps accidental
 * loops; a determined attacker still needs an edge/WAF rule. The important
 * part is that no public route is completely unbounded.
 */
interface Window {
  startedAt: number;
  count: number;
}

const globalForLimit = globalThis as unknown as {
  __litespmRateWindows?: Map<string, Window>;
};

function windows(): Map<string, Window> {
  return (globalForLimit.__litespmRateWindows ??= new Map());
}

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
  remaining: number;
}

export function rateLimit(key: string, max: number, windowMs: number): RateLimitResult {
  const map = windows();
  const now = Date.now();
  const current = map.get(key);

  if (!current || now - current.startedAt >= windowMs) {
    map.set(key, { startedAt: now, count: 1 });
    return { allowed: true, retryAfterSeconds: 0, remaining: Math.max(0, max - 1) };
  }

  if (current.count >= max) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((current.startedAt + windowMs - now) / 1000)),
      remaining: 0,
    };
  }

  current.count += 1;
  return { allowed: true, retryAfterSeconds: 0, remaining: Math.max(0, max - current.count) };
}

/** Best-effort client identity. Platform proxies set these; do not trust them for auth. */
export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

export function tooManyRequests(result: RateLimitResult): Response {
  return new Response(JSON.stringify({ error: "Too many requests. Please try again shortly." }), {
    status: 429,
    headers: {
      "Content-Type": "application/json",
      "Retry-After": String(result.retryAfterSeconds),
    },
  });
}
