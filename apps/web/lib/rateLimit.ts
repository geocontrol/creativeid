import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { type NextRequest } from 'next/server';

const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(100, '1 m'), // 100 req/min per IP
  analytics: false,
});

/**
 * Extract the real client IP, preferring platform-specific trusted headers
 * over the spoofable x-forwarded-for value.
 * Cloudflare → cf-connecting-ip
 * Vercel / nginx → x-real-ip
 * Generic proxy → first value of x-forwarded-for (only reliable behind a
 *   trusted reverse proxy that strips the header on ingress)
 */
function getClientIp(req: NextRequest): string {
  return (
    req.headers.get('cf-connecting-ip') ??
    req.headers.get('x-real-ip') ??
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    '127.0.0.1'
  );
}

export async function checkRateLimit(req: NextRequest): Promise<
  { success: true } | { success: false; response: Response }
> {
  const ip = getClientIp(req);
  const { success, limit, reset, remaining } = await ratelimit.limit(ip);

  if (!success) {
    return {
      success: false,
      response: new Response(
        JSON.stringify({ error: 'Too many requests' }),
        {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            'X-RateLimit-Limit': String(limit),
            'X-RateLimit-Remaining': String(remaining),
            'X-RateLimit-Reset': String(reset),
          },
        },
      ),
    };
  }
  return { success: true };
}
