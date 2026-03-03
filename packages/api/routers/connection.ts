import { TRPCError } from '@trpc/server';
import { eq, and, or, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import { connections, identities } from '@creativeid/db/schema';
import { requestConnectionSchema, respondConnectionSchema } from '@creativeid/types';
import { createTRPCRouter, publicProcedure, protectedProcedure } from '../trpc';

export const connectionRouter = createTRPCRouter({
  /** Public: list accepted connections for an identity. */
  list: publicProcedure
    .input(z.object({ identityId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const accepted = await ctx.db
        .select({
          id: connections.id,
          type: connections.type,
          note: connections.note,
          createdAt: connections.createdAt,
          identity: {
            id: identities.id,
            ciid: identities.ciid,
            handle: identities.handle,
            displayName: identities.displayName,
            avatarUrl: identities.avatarUrl,
            disciplines: identities.disciplines,
          },
        })
        .from(connections)
        .innerJoin(
          identities,
          or(
            and(
              eq(connections.fromId, input.identityId),
              eq(identities.id, connections.toId),
            ),
            and(
              eq(connections.toId, input.identityId),
              eq(identities.id, connections.fromId),
            ),
          ),
        )
        .where(
          and(
            eq(connections.status, 'accepted'),
            or(
              eq(connections.fromId, input.identityId),
              eq(connections.toId, input.identityId),
            ),
            isNull(identities.deletedAt),
          ),
        );

      return accepted;
    }),

  /** Protected: list pending connection requests received by the authenticated identity. */
  pending: protectedProcedure.query(async ({ ctx }) => {
    if (!ctx.identity) throw new TRPCError({ code: 'NOT_FOUND' });

    const pending = await ctx.db
      .select({
        id: connections.id,
        type: connections.type,
        note: connections.note,
        createdAt: connections.createdAt,
        requester: {
          id: identities.id,
          ciid: identities.ciid,
          handle: identities.handle,
          displayName: identities.displayName,
          avatarUrl: identities.avatarUrl,
          disciplines: identities.disciplines,
          connectionCount: identities.connectionCount,
        },
      })
      .from(connections)
      .innerJoin(identities, eq(identities.id, connections.fromId))
      .where(
        and(
          eq(connections.toId, ctx.identity.id),
          eq(connections.status, 'pending'),
          isNull(identities.deletedAt),
        ),
      );

    return pending;
  }),

  /** Mutation: send a connection request. */
  request: protectedProcedure
    .input(requestConnectionSchema)
    .mutation(async ({ ctx, input }) => {
      if (!ctx.identity) throw new TRPCError({ code: 'NOT_FOUND' });
      if (input.toIdentityId === ctx.identity.id) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Cannot connect to yourself.' });
      }

      const [connection] = await ctx.db
        .insert(connections)
        .values({
          fromId: ctx.identity.id,
          toId: input.toIdentityId,
          type: input.type,
          note: input.note ?? null,
          status: 'pending',
          initiatedBy: ctx.identity.id,
        })
        .returning();

      return connection!;
    }),

  /** Mutation: accept a pending connection request. Increments both connection_counts. */
  accept: protectedProcedure
    .input(respondConnectionSchema)
    .mutation(async ({ ctx, input }) => {
      if (!ctx.identity) throw new TRPCError({ code: 'NOT_FOUND' });

      const [connection] = await ctx.db
        .select()
        .from(connections)
        .where(
          and(
            eq(connections.id, input.connectionId),
            eq(connections.toId, ctx.identity.id),
            eq(connections.status, 'pending'),
          ),
        )
        .limit(1);

      if (!connection) throw new TRPCError({ code: 'NOT_FOUND' });

      // Wrap status update and counter increments in a transaction so a partial
      // failure cannot leave connection_count inconsistent with connection status.
      await ctx.db.transaction(async (tx) => {
        await tx
          .update(connections)
          .set({ status: 'accepted', updatedAt: new Date() })
          .where(eq(connections.id, input.connectionId));

        await tx
          .update(identities)
          .set({ connectionCount: sql`${identities.connectionCount} + 1` })
          .where(or(eq(identities.id, connection.fromId), eq(identities.id, connection.toId)));
      });

      return { success: true };
    }),

  /** Mutation: decline a pending connection request. */
  decline: protectedProcedure
    .input(respondConnectionSchema)
    .mutation(async ({ ctx, input }) => {
      if (!ctx.identity) throw new TRPCError({ code: 'NOT_FOUND' });

      const [connection] = await ctx.db
        .select()
        .from(connections)
        .where(
          and(
            eq(connections.id, input.connectionId),
            eq(connections.toId, ctx.identity.id),
            eq(connections.status, 'pending'),
          ),
        )
        .limit(1);

      if (!connection) throw new TRPCError({ code: 'NOT_FOUND' });

      await ctx.db
        .update(connections)
        .set({ status: 'declined', updatedAt: new Date() })
        .where(eq(connections.id, input.connectionId));

      return { success: true };
    }),

  /** Mutation: remove an accepted connection. Decrements both connection_counts. */
  remove: protectedProcedure
    .input(z.object({ connectionId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.identity) throw new TRPCError({ code: 'NOT_FOUND' });

      const [connection] = await ctx.db
        .select()
        .from(connections)
        .where(
          and(
            eq(connections.id, input.connectionId),
            eq(connections.status, 'accepted'),
            or(
              eq(connections.fromId, ctx.identity.id),
              eq(connections.toId, ctx.identity.id),
            ),
          ),
        )
        .limit(1);

      if (!connection) throw new TRPCError({ code: 'NOT_FOUND' });

      // Wrap deletion and counter decrements in a transaction so a partial
      // failure cannot leave connection_count inconsistent with connection status.
      await ctx.db.transaction(async (tx) => {
        await tx.delete(connections).where(eq(connections.id, input.connectionId));

        await tx
          .update(identities)
          .set({ connectionCount: sql`GREATEST(${identities.connectionCount} - 1, 0)` })
          .where(or(eq(identities.id, connection.fromId), eq(identities.id, connection.toId)));
      });

      return { success: true };
    }),
});
