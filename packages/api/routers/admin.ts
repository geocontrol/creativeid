/**
 * Admin router — backend only, no UI at MVP.
 * Protected by ADMIN_SECRET env var check — not exposed via OAuth.
 * Used only in egregious handle squatting cases.
 */
import { TRPCError } from '@trpc/server';
import { eq, isNull, and } from 'drizzle-orm';
import { z } from 'zod';
import { identities } from '@creativeid/db/schema';
import { createTRPCRouter, adminProcedure } from '../trpc';

const adminInputBase = z.object({ adminSecret: z.string() });

export const adminRouter = createTRPCRouter({
  /** Move a handle from one identity to another. */
  reassignHandle: adminProcedure
    .input(adminInputBase.extend({
      fromIdentityId: z.string().uuid(),
      toIdentityId: z.string().uuid(),
    }))
    .mutation(async ({ ctx, input }) => {
      const [from] = await ctx.db
        .select()
        .from(identities)
        .where(and(eq(identities.id, input.fromIdentityId), isNull(identities.deletedAt)))
        .limit(1);

      if (!from?.handle) throw new TRPCError({ code: 'NOT_FOUND', message: 'Source identity has no handle.' });

      const handle = from.handle;

      // Clear the handle from the source identity
      await ctx.db
        .update(identities)
        .set({ handle: null, updatedAt: new Date() })
        .where(eq(identities.id, input.fromIdentityId));

      // Assign to the target identity
      await ctx.db
        .update(identities)
        .set({ handle, updatedAt: new Date() })
        .where(eq(identities.id, input.toIdentityId));

      return { success: true, handle };
    }),

  /** Remove a handle from an identity, returning it to unclaimed. */
  clearHandle: adminProcedure
    .input(adminInputBase.extend({ identityId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [identity] = await ctx.db
        .select()
        .from(identities)
        .where(and(eq(identities.id, input.identityId), isNull(identities.deletedAt)))
        .limit(1);

      if (!identity) throw new TRPCError({ code: 'NOT_FOUND' });

      await ctx.db
        .update(identities)
        .set({ handle: null, updatedAt: new Date() })
        .where(eq(identities.id, input.identityId));

      return { success: true };
    }),
});
