import { TRPCError } from '@trpc/server';
import { eq, and, isNull, ilike, desc } from 'drizzle-orm';
import { z } from 'zod';
import { identities } from '@creativeid/db/schema';
import {
  createIdentitySchema,
  updateIdentitySchema,
  setHandleSchema,
  generateCiid,
  validateHandle,
  generateContentHash,
} from '@creativeid/types';
import { createTRPCRouter, publicProcedure, protectedProcedure } from '../trpc';

export const identityRouter = createTRPCRouter({
  /** Fetch the authenticated user's own identity. */
  me: protectedProcedure.query(async ({ ctx }) => {
    if (!ctx.identity) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'No identity found for this account.' });
    }
    return ctx.identity;
  }),

  /** Public: fetch an identity by handle string. */
  getByHandle: publicProcedure
    .input(z.object({ handle: z.string() }))
    .query(async ({ ctx, input }) => {
      const [identity] = await ctx.db
        .select()
        .from(identities)
        .where(and(eq(identities.handle, input.handle), isNull(identities.deletedAt)))
        .limit(1);

      if (!identity) throw new TRPCError({ code: 'NOT_FOUND' });
      if (identity.visibility === 'private') throw new TRPCError({ code: 'NOT_FOUND' });

      // Strip private fields from public response
      const { legalName: _legal, clerkUserId: _clerk, ...publicIdentity } = identity;
      return publicIdentity;
    }),

  /** Public: fetch an identity by UUID or CIID. */
  getById: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const isCiid = input.id.startsWith('ciid_');
      const [identity] = await ctx.db
        .select()
        .from(identities)
        .where(
          and(
            isCiid ? eq(identities.ciid, input.id) : eq(identities.id, input.id),
            isNull(identities.deletedAt),
          ),
        )
        .limit(1);

      if (!identity) throw new TRPCError({ code: 'NOT_FOUND' });
      if (identity.visibility === 'private') throw new TRPCError({ code: 'NOT_FOUND' });

      const { legalName: _legal, clerkUserId: _clerk, ...publicIdentity } = identity;
      return publicIdentity;
    }),

  /** Search identities by display name (ordered by connection_count desc). */
  search: publicProcedure
    .input(z.object({ query: z.string().min(1).max(100) }))
    .query(async ({ ctx, input }) => {
      // Escape SQL wildcard characters to prevent pattern-based DoS.
      const escaped = input.query.replace(/[%_\\]/g, '\\$&');
      const results = await ctx.db
        .select()
        .from(identities)
        .where(
          and(
            ilike(identities.displayName, `%${escaped}%`),
            isNull(identities.deletedAt),
            eq(identities.visibility, 'public'),
          ),
        )
        .orderBy(desc(identities.connectionCount))
        .limit(20);

      return results.map(({ legalName: _l, clerkUserId: _c, ...pub }) => pub);
    }),

  /** Mutation: create a new identity record (called after Clerk onboarding step 1). */
  create: protectedProcedure
    .input(createIdentitySchema)
    .mutation(async ({ ctx, input }) => {
      // MVP: one identity per Clerk account — enforce in application logic
      const existing = await ctx.db
        .select({ id: identities.id })
        .from(identities)
        .where(and(eq(identities.clerkUserId, ctx.userId), isNull(identities.deletedAt)))
        .limit(1);

      if (existing.length > 0) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'An identity already exists for this account.',
        });
      }

      const ciid = generateCiid();
      const [created] = await ctx.db
        .insert(identities)
        .values({
          ciid,
          clerkUserId: ctx.userId,
          displayName: input.displayName,
          disciplines: input.disciplines ?? [],
          isPrimary: true,
        })
        .returning();

      return created!;
    }),

  /** Mutation: update own identity fields. */
  update: protectedProcedure
    .input(updateIdentitySchema)
    .mutation(async ({ ctx, input }) => {
      if (!ctx.identity) throw new TRPCError({ code: 'NOT_FOUND' });

      const [updated] = await ctx.db
        .update(identities)
        .set({ ...input, updatedAt: new Date() })
        .where(eq(identities.id, ctx.identity.id))
        .returning();

      return updated!;
    }),

  /** Mutation: claim a handle. Validates slug rules and uniqueness. */
  setHandle: protectedProcedure
    .input(setHandleSchema)
    .mutation(async ({ ctx, input }) => {
      if (!ctx.identity) throw new TRPCError({ code: 'NOT_FOUND' });

      const validation = validateHandle(input.handle);
      if (!validation.valid) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: validation.reason });
      }

      // Check uniqueness
      const [existing] = await ctx.db
        .select({ id: identities.id })
        .from(identities)
        .where(eq(identities.handle, input.handle))
        .limit(1);

      if (existing) {
        throw new TRPCError({ code: 'CONFLICT', message: 'Handle unavailable.' });
      }

      try {
        const [updated] = await ctx.db
          .update(identities)
          .set({ handle: input.handle, updatedAt: new Date() })
          .where(eq(identities.id, ctx.identity.id))
          .returning();
        return updated!;
      } catch (err: unknown) {
        // Postgres unique_violation — two concurrent requests raced past the
        // uniqueness check above; the DB constraint caught it.
        const pgCode = (err as { cause?: { code?: string } })?.cause?.code;
        if (pgCode === '23505') {
          throw new TRPCError({ code: 'CONFLICT', message: 'Handle unavailable.' });
        }
        throw err;
      }
    }),

  /** Mutation: publish profile — generate and store content_hash. */
  publish: protectedProcedure.mutation(async ({ ctx }) => {
    if (!ctx.identity) throw new TRPCError({ code: 'NOT_FOUND' });

    const contentHash = generateContentHash({
      ciid: ctx.identity.ciid,
      display_name: ctx.identity.displayName,
      disciplines: ctx.identity.disciplines,
      artist_statement: ctx.identity.artistStatement,
      biography: ctx.identity.biography,
    });

    const [updated] = await ctx.db
      .update(identities)
      .set({ contentHash, updatedAt: new Date() })
      .where(eq(identities.id, ctx.identity.id))
      .returning();

    return updated!;
  }),

  /** Mutation: soft-delete own identity. */
  delete: protectedProcedure.mutation(async ({ ctx }) => {
    if (!ctx.identity) throw new TRPCError({ code: 'NOT_FOUND' });

    await ctx.db
      .update(identities)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(identities.id, ctx.identity.id));

    return { success: true };
  }),
});
