import { TRPCError } from '@trpc/server';
import { eq, and, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { works, workCredits, identities } from '@creativeid/db/schema';
import {
  createWorkSchema,
  updateWorkSchema,
  addCreditSchema,
  removeCreditSchema,
} from '@creativeid/types';
import { createTRPCRouter, publicProcedure, protectedProcedure } from '../trpc';

export const workRouter = createTRPCRouter({
  /** Public: list works for an identity (by identity UUID). */
  list: publicProcedure
    .input(z.object({ identityId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const workList = await ctx.db
        .select()
        .from(works)
        .where(and(eq(works.createdBy, input.identityId), isNull(works.deletedAt)));

      return workList;
    }),

  /** Public: single work with all credits. */
  getById: publicProcedure
    .input(z.object({ workId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [work] = await ctx.db
        .select()
        .from(works)
        .where(and(eq(works.id, input.workId), isNull(works.deletedAt)))
        .limit(1);

      if (!work) throw new TRPCError({ code: 'NOT_FOUND' });

      const credits = await ctx.db
        .select({
          id: workCredits.id,
          role: workCredits.role,
          roleNote: workCredits.roleNote,
          creditOrder: workCredits.creditOrder,
          attested: workCredits.attested,
          createdAt: workCredits.createdAt,
          identity: {
            id: identities.id,
            ciid: identities.ciid,
            handle: identities.handle,
            displayName: identities.displayName,
            avatarUrl: identities.avatarUrl,
            disciplines: identities.disciplines,
          },
        })
        .from(workCredits)
        .innerJoin(identities, eq(workCredits.identityId, identities.id))
        .where(eq(workCredits.workId, input.workId));

      return { ...work, credits };
    }),

  /** Mutation: create a work and auto-add creator as a credit. */
  create: protectedProcedure
    .input(createWorkSchema)
    .mutation(async ({ ctx, input }) => {
      if (!ctx.identity) throw new TRPCError({ code: 'NOT_FOUND' });

      const { role, roleNote, ...workData } = input;

      const [work] = await ctx.db
        .insert(works)
        .values({ ...workData, createdBy: ctx.identity.id })
        .returning();

      // Auto-add creator as a credit
      await ctx.db.insert(workCredits).values({
        workId: work!.id,
        identityId: ctx.identity.id,
        role,
        roleNote: roleNote ?? null,
        creditOrder: 0,
      });

      return work!;
    }),

  /** Mutation: update own work. */
  update: protectedProcedure
    .input(updateWorkSchema)
    .mutation(async ({ ctx, input }) => {
      if (!ctx.identity) throw new TRPCError({ code: 'NOT_FOUND' });

      const { workId, ...updateData } = input;

      const [existing] = await ctx.db
        .select()
        .from(works)
        .where(and(eq(works.id, workId), isNull(works.deletedAt)))
        .limit(1);

      if (!existing) throw new TRPCError({ code: 'NOT_FOUND' });
      if (existing.createdBy !== ctx.identity.id) throw new TRPCError({ code: 'FORBIDDEN' });

      const [updated] = await ctx.db
        .update(works)
        .set({ ...updateData, updatedAt: new Date() })
        .where(eq(works.id, workId))
        .returning();

      return updated!;
    }),

  /** Mutation: soft-delete own work. */
  delete: protectedProcedure
    .input(z.object({ workId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.identity) throw new TRPCError({ code: 'NOT_FOUND' });

      const [existing] = await ctx.db
        .select()
        .from(works)
        .where(and(eq(works.id, input.workId), isNull(works.deletedAt)))
        .limit(1);

      if (!existing) throw new TRPCError({ code: 'NOT_FOUND' });
      if (existing.createdBy !== ctx.identity.id) throw new TRPCError({ code: 'FORBIDDEN' });

      await ctx.db
        .update(works)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(eq(works.id, input.workId));

      return { success: true };
    }),

  /** Mutation: add a collaborator credit to a work (caller must own the work). */
  addCredit: protectedProcedure
    .input(addCreditSchema)
    .mutation(async ({ ctx, input }) => {
      if (!ctx.identity) throw new TRPCError({ code: 'NOT_FOUND' });

      const [work] = await ctx.db
        .select()
        .from(works)
        .where(and(eq(works.id, input.workId), isNull(works.deletedAt)))
        .limit(1);

      if (!work) throw new TRPCError({ code: 'NOT_FOUND' });
      if (work.createdBy !== ctx.identity.id) throw new TRPCError({ code: 'FORBIDDEN' });

      const [credit] = await ctx.db
        .insert(workCredits)
        .values({
          workId: input.workId,
          identityId: input.identityId,
          role: input.role,
          roleNote: input.roleNote ?? null,
          creditOrder: input.creditOrder ?? 0,
        })
        .returning();

      return credit!;
    }),

  /** Mutation: remove a credit from own work. */
  removeCredit: protectedProcedure
    .input(removeCreditSchema)
    .mutation(async ({ ctx, input }) => {
      if (!ctx.identity) throw new TRPCError({ code: 'NOT_FOUND' });

      const [credit] = await ctx.db
        .select()
        .from(workCredits)
        .where(eq(workCredits.id, input.creditId))
        .limit(1);

      if (!credit) throw new TRPCError({ code: 'NOT_FOUND' });

      // Verify caller owns the work this credit belongs to
      const [work] = await ctx.db
        .select()
        .from(works)
        .where(and(eq(works.id, input.workId), isNull(works.deletedAt)))
        .limit(1);

      if (!work) throw new TRPCError({ code: 'NOT_FOUND' });
      if (work.createdBy !== ctx.identity.id) throw new TRPCError({ code: 'FORBIDDEN' });

      await ctx.db.delete(workCredits).where(eq(workCredits.id, input.creditId));

      return { success: true };
    }),
});
