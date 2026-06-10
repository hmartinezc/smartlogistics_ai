import type { MiddlewareHandler } from 'hono';
import { randomUUID } from 'node:crypto';

interface RateLimitOptions {
  keyPrefix: string;
  max: number;
  windowMs: number;
}

interface RateLimitBucket {
  count: number;
  resetAt: number;
}

const rateLimitBuckets = new Map<string, RateLimitBucket>();
const MAX_BUCKETS_BEFORE_CLEANUP = 5000;

function getClientAddress(headers: Headers): string {
  const forwardedFor = headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return (
    forwardedFor ||
    headers.get('cf-connecting-ip') ||
    headers.get('x-real-ip') ||
    headers.get('fly-client-ip') ||
    'unknown'
  );
}

function cleanupExpiredBuckets(now: number): void {
  if (rateLimitBuckets.size < MAX_BUCKETS_BEFORE_CLEANUP) {
    return;
  }

  for (const [key, bucket] of rateLimitBuckets.entries()) {
    if (bucket.resetAt <= now) {
      rateLimitBuckets.delete(key);
    }
  }
}

export function securityHeaders(): MiddlewareHandler {
  return async (c, next) => {
    const requestId = c.req.header('X-Request-Id') || randomUUID();
    c.header('X-Request-Id', requestId);

    await next();

    c.header('Cross-Origin-Opener-Policy', 'same-origin');
    c.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
    c.header('X-Content-Type-Options', 'nosniff');
    c.header('X-Frame-Options', 'DENY');
  };
}

export function rateLimit(options: RateLimitOptions): MiddlewareHandler {
  return async (c, next) => {
    const now = Date.now();
    cleanupExpiredBuckets(now);

    const sessionId = c.req.header('X-Session-Id') || 'anonymous';
    const clientAddress = getClientAddress(c.req.raw.headers);
    const key = `${options.keyPrefix}:${clientAddress}:${sessionId}`;
    const existing = rateLimitBuckets.get(key);
    const bucket =
      existing && existing.resetAt > now
        ? existing
        : {
            count: 0,
            resetAt: now + options.windowMs,
          };

    bucket.count += 1;
    rateLimitBuckets.set(key, bucket);

    const retryAfterSeconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
    c.header('X-RateLimit-Limit', String(options.max));
    c.header('X-RateLimit-Remaining', String(Math.max(0, options.max - bucket.count)));
    c.header('X-RateLimit-Reset', String(Math.ceil(bucket.resetAt / 1000)));

    if (bucket.count > options.max) {
      c.header('Retry-After', String(retryAfterSeconds));
      return c.json(
        {
          error: 'Demasiadas solicitudes. Intenta nuevamente en unos minutos.',
        },
        429,
      );
    }

    return next();
  };
}
