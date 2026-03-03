import { initTRPC, TRPCError } from '@trpc/server';
import { type CreateNextContextOptions } from '@trpc/server/adapters/next';
import { auth } from '@clerk/nextjs/server';
import { db } from '@creativeid/db';
import { identities } from '@creativeid/db/schema';
import { eq, and, isNull } from 'drizzle-orm';

// ─── Context ──────────────────────────────────────────────────────────────────

export async function createTRPCContext(_opts: CreateNextContextOptions) {
  const { userId } = await auth();
  return { db, userId };
}

export type Context = Awaited<ReturnType<typeof createTRPCContext>>;

// ─── tRPC initialisation ─────────────────────────────────────────────────────

const t = initTRPC.context<Context>().create();

export const createTRPCRouter = t.router;
export const publicProcedure = t.procedure;

// ─── Auth middleware ──────────────────────────────────────────────────────────

const enforceUserIsAuthed = t.middleware(async ({ ctx, next }) => {
  if (!ctx.userId) {
    throw new TRPCError({ code: 'UNAUTHORIZED' });
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

const enforceAdmin = t.middleware(({ ctx, next, input }) => {
  const adminSecret = process.env['ADMIN_SECRET'];
  if (!adminSecret) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
  // Admin procedures receive the secret in the input.
  const inputSecret = (input as Record<string, unknown>)['adminSecret'];
  if (inputSecret !== adminSecret) {
    throw new TRPCError({ code: 'FORBIDDEN' });
  }
  return next({ ctx });
});

export const adminProcedure = t.procedure.use(enforceAdmin);
