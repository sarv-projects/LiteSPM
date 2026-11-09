/**
 * Small in-memory fixed-window limiter for the public write/LLM routes, plus a
 * per-instance sliding-window budget for the LLM route as a whole.
 *
 * This is deliberately not a distributed limiter: on Vercel each instance has
 * its own map. It raises the cost of a trivial script and caps accidental
 * loops; a determined attacker still needs an edge/WAF rule. The important
 * part is that no public route is completely unbounded — and that the LLM
 * route has a ceiling no caller-controlled header can lift (globalBudget).
 */
interface Window {
  startedAt: number;
  count: number;
  windowMs: number;
}

const RATE_WINDOW_MAX_KEYS = 10_000;

const globalForLimit = globalThis as unknown as {
  __litespmRateWindows?: Map<string, Window>;
};

function windows(): Map<string, Window> {
  return (globalForLimit.__litespmRateWindows ??= new Map());
}

/** Bound attacker-controlled key growth and opportunistically evict expired buckets. */
function pruneWindows(map: Map<string, Window>, now: number): void {
  if (map.size < RATE_WINDOW_MAX_KEYS) return;
  for (const [key, value] of map) {
    if (now - value.startedAt >= value.windowMs) map.delete(key);
  }
  while (map.size >= RATE_WINDOW_MAX_KEYS) {
    const oldest = map.keys().next().value;
    if (oldest === undefined) break;
    map.delete(oldest);
  }
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
    if (!current) pruneWindows(map, now);
    map.set(key, { startedAt: now, count: 1, windowMs });
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

const globalForBudget = globalThis as unknown as {
  __litespmGlobalBudgets?: Map<string, number[]>;
};

function budgets(): Map<string, number[]> {
  return (globalForBudget.__litespmGlobalBudgets ??= new Map());
}

/**
 * A sliding-window budget shared by every caller of one scope on this
 * instance, keyed on nothing the caller sends. It is the second line for the
 * LLM route: the per-IP bucket is keyed on a proxy-supplied address, so a
 * client that can rotate that address (direct-to-origin access, an edge that
 * preserves client XFF, future proxy changes) would otherwise get a fresh
 * bucket each request. This ceiling cannot be renamed by a header.
 *
 * Each scope keeps at most `max` timestamps, so memory is bounded by the
 * scope count; expired entries are dropped on the next call.
 */
export function globalBudget(scope: string, max: number, windowMs: number): RateLimitResult {
  const map = budgets();
  const now = Date.now();
  const cutoff = now - windowMs;
  const events = (map.get(scope) ?? []).filter((at) => at > cutoff);

  if (events.length >= max) {
    map.set(scope, events);
    const oldest = events[0] ?? now;
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((oldest + windowMs - now) / 1000)),
      remaining: 0,
    };
  }

  events.push(now);
  map.set(scope, events);
  return { allowed: true, retryAfterSeconds: 0, remaining: Math.max(0, max - events.length) };
}

/**
 * The rightmost non-empty hop of a forwarded chain: the entry appended by the
 * proxy nearest the server. A client-supplied chain sits to its left.
 */
function platformHop(value: string | null): string {
  if (!value) return "";
  const parts = value.split(",");
  for (let i = parts.length - 1; i >= 0; i -= 1) {
    const hop = parts[i]?.trim();
    if (hop) return hop;
  }
  return "";
}

/**
 * Best-effort client identity. Platform proxies set these; do not trust them for auth.
 *
 * Keying on the LEFTMOST x-forwarded-for entry made the rate-limit bucket
 * client-controllable: the leftmost entry is whatever the caller sent. The
 * platform-set value is preferred where the platform names one
 * (x-vercel-forwarded-for), and the rightmost x-forwarded-for hop — the one
 * added by the nearest proxy — otherwise. Never the leftmost.
 */
export function clientIp(request: Request): string {
  const vercel = platformHop(request.headers.get("x-vercel-forwarded-for"));
  if (vercel) return vercel;

  const forwarded = platformHop(request.headers.get("x-forwarded-for"));
  if (forwarded) return forwarded;

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
