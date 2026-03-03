/**
 * Group router — scaffolded at MVP, full implementation in Phase 1.
 * Schema is ready; no UI is built for groups at MVP.
 */
import { TRPCError } from '@trpc/server';
import { eq, and, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { groups, groupMemberships, identities } from '@creativeid/db/schema';
import { createGroupSchema, addGroupMemberSchema } from '@creativeid/types';
import { createTRPCRouter, publicProcedure, protectedProcedure } from '../trpc';

export const groupRouter = createTRPCRouter({
  getById: publicProcedure
    .input(z.object({ groupId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [group] = await ctx.db
        .select()
        .from(groups)
        .where(eq(groups.id, input.groupId))
        .limit(1);
      if (!group) throw new TRPCError({ code: 'NOT_FOUND' });
      return group;
    }),

  listMembers: publicProcedure
    .input(z.object({ groupId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const members = await ctx.db
        .select({
          id: groupMemberships.id,
          role: groupMemberships.role,
          joinedAt: groupMemberships.joinedAt,
          leftAt: groupMemberships.leftAt,
          identity: {
            id: identities.id,
            ciid: identities.ciid,
            handle: identities.handle,
            displayName: identities.displayName,
            avatarUrl: identities.avatarUrl,
            disciplines: identities.disciplines,
          },
        })
        .from(groupMemberships)
        .innerJoin(identities, eq(groupMemberships.identityId, identities.id))
        .where(and(eq(groupMemberships.groupId, input.groupId), isNull(identities.deletedAt)));
      return members;
    }),

  create: protectedProcedure
    .input(createGroupSchema)
    .mutation(async ({ ctx, input }) => {
      if (!ctx.identity) throw new TRPCError({ code: 'NOT_FOUND' });
      const [group] = await ctx.db
        .insert(groups)
        .values({ ...input, createdBy: ctx.identity.id })
        .returning();
      return group!;
    }),

  update: protectedProcedure
    .input(z.object({ groupId: z.string().uuid(), name: z.string().optional(), description: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.identity) throw new TRPCError({ code: 'NOT_FOUND' });
      const { groupId, ...updateData } = input;
      const [group] = await ctx.db.select().from(groups).where(eq(groups.id, groupId)).limit(1);
      if (!group) throw new TRPCError({ code: 'NOT_FOUND' });
      if (group.createdBy !== ctx.identity.id) throw new TRPCError({ code: 'FORBIDDEN' });
      const [updated] = await ctx.db.update(groups).set({ ...updateData, updatedAt: new Date() }).where(eq(groups.id, groupId)).returning();
      return updated!;
    }),

  addMember: protectedProcedure
    .input(addGroupMemberSchema)
    .mutation(async ({ ctx, input }) => {
      if (!ctx.identity) throw new TRPCError({ code: 'NOT_FOUND' });
      const [group] = await ctx.db.select().from(groups).where(eq(groups.id, input.groupId)).limit(1);
      if (!group) throw new TRPCError({ code: 'NOT_FOUND' });
      if (group.createdBy !== ctx.identity.id) throw new TRPCError({ code: 'FORBIDDEN' });
      const [membership] = await ctx.db.insert(groupMemberships).values({
        groupId: input.groupId,
        identityId: input.identityId,
        role: input.role ?? 'member',
      }).returning();
      return membership!;
    }),

  removeMember: protectedProcedure
    .input(z.object({ groupId: z.string().uuid(), identityId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.identity) throw new TRPCError({ code: 'NOT_FOUND' });
      const [group] = await ctx.db.select().from(groups).where(eq(groups.id, input.groupId)).limit(1);
      if (!group) throw new TRPCError({ code: 'NOT_FOUND' });
      if (group.createdBy !== ctx.identity.id) throw new TRPCError({ code: 'FORBIDDEN' });
      await ctx.db.delete(groupMemberships).where(
        and(
          eq(groupMemberships.groupId, input.groupId),
          eq(groupMemberships.identityId, input.identityId),
        ),
      );
      return { success: true };
    }),
});
