import { initTRPC, TRPCError } from '@trpc/server';
import { type FetchCreateContextFnOptions } from '@trpc/server/adapters/fetch';
import { auth } from '@clerk/nextjs/server';
import { db } from '@creativeid/db';
import { identities } from '@creativeid/db/schema';
import { eq, and, isNull } from 'drizzle-orm';
import superjson from 'superjson';
import { timingSafeEqual } from 'crypto';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

// ─── IP extraction helper ──────────────────────────────────────────────────────
// Prefer platform-specific trusted headers to avoid x-forwarded-for spoofing
// when the app is not behind a trusted reverse proxy.

function getClientIp(headers: Headers): string {
  return (
    headers.get('cf-connecting-ip') ??   // Cloudflare
    headers.get('x-real-ip') ??          // Vercel / nginx
    headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    '127.0.0.1'
  );
}

// ─── Rate limiters ────────────────────────────────────────────────────────────
// Optional: skipped in environments where Upstash env vars are not configured.

const upstashConfigured =
  Boolean(process.env['UPSTASH_REDIS_REST_URL']) &&
  Boolean(process.env['UPSTASH_REDIS_REST_TOKEN']);

// 120 calls/min per authenticated user (mutations)
const mutationRatelimit = upstashConfigured
  ? new Ratelimit({
      redis: Redis.fromEnv(),
      limiter: Ratelimit.slidingWindow(120, '1 m'),
      analytics: false,
      prefix: 'trpc:authed',
    })
  : null;

// 150 calls/min per IP for unauthenticated public procedures
const publicRatelimit = upstashConfigured
  ? new Ratelimit({
      redis: Redis.fromEnv(),
      limiter: Ratelimit.slidingWindow(150, '1 m'),
      analytics: false,
      prefix: 'trpc:public',
    })
  : null;

// ─── Context ──────────────────────────────────────────────────────────────────

export async function createTRPCContext(opts: FetchCreateContextFnOptions) {
  const { userId } = await auth();
  // Headers are passed through so middleware (e.g. admin auth) can read them
  // without the client being able to inject them via request body.
  return { db, userId, headers: opts.req.headers };
}

export type Context = Awaited<ReturnType<typeof createTRPCContext>>;

// ─── tRPC initialisation ─────────────────────────────────────────────────────

const t = initTRPC.context<Context>().create({
  transformer: superjson,
});

export const createTRPCRouter = t.router;

// ─── Public rate-limit middleware ─────────────────────────────────────────────

const enforcePublicRateLimit = t.middleware(async ({ ctx, next }) => {
  if (publicRatelimit) {
    const ip = getClientIp(ctx.headers);
    const { success } = await publicRatelimit.limit(ip);
    if (!success) {
      throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: 'Too many requests. Please slow down.' });
    }
  }
  return next({ ctx });
});

export const publicProcedure = t.procedure.use(enforcePublicRateLimit);

// ─── Auth middleware ──────────────────────────────────────────────────────────

const enforceUserIsAuthed = t.middleware(async ({ ctx, next }) => {
  if (!ctx.userId) {
    throw new TRPCError({ code: 'UNAUTHORIZED' });
  }

  // CSRF check: reject cross-origin authenticated requests. Server-side calls
  // (no Origin header) are always allowed.
  const origin = ctx.headers.get('origin');
  if (origin) {
    const appUrl = process.env['NEXT_PUBLIC_APP_URL'] ?? '';
    let allowed: string;
    try {
      allowed = new URL(appUrl).origin;
    } catch {
      // Malformed APP_URL — block in production, skip in dev.
      if (process.env['NODE_ENV'] === 'production') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'CSRF validation failed.' });
      }
      allowed = '';
    }
    if (allowed && origin !== allowed) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'CSRF validation failed.' });
    }
  }

  // Per-user rate limiting — enforced when Upstash is configured.
  if (mutationRatelimit) {
    const { success } = await mutationRatelimit.limit(ctx.userId);
    if (!success) {
      throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: 'Too many requests. Please slow down.' });
    }
  }

  // Resolve the caller's identity from the DB (MVP: one identity per account).
  const [identity] = await ctx.db
    .select()
    .from(identities)
    .where(and(eq(identities.clerkUserId, ctx.userId), isNull(identities.deletedAt)))
    .limit(1);

  return next({ ctx: { ...ctx, userId: ctx.userId, identity: identity ?? null } });
});

export const protectedProcedure = t.procedure.use(enforceUserIsAuthed);

// ─── Admin middleware ─────────────────────────────────────────────────────────
// The admin secret MUST be sent as an HTTP header: Authorization: Bearer <secret>
// It must never appear in the request body or URL, where it can be logged or cached.

const enforceAdmin = t.middleware(({ ctx, next }) => {
  const adminSecret = process.env['ADMIN_SECRET'];
  if (!adminSecret) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });

  const authHeader = ctx.headers.get('authorization') ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';

  if (!token) {
    throw new TRPCError({ code: 'FORBIDDEN' });
  }

  // Pad to equal length before comparing to ensure timingSafeEqual is meaningful.
  const expected = Buffer.from(adminSecret, 'utf8');
  const provided = Buffer.from(token, 'utf8');
  const match =
    expected.length === provided.length && timingSafeEqual(expected, provided);
  if (!match) {
    throw new TRPCError({ code: 'FORBIDDEN' });
  }
  return next({ ctx });
});

export const adminProcedure = t.procedure.use(enforceAdmin);
