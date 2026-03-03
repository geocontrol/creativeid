import { eq, and, isNull } from 'drizzle-orm';
import { contentReports, identities } from '@creativeid/db/schema';
import { createReportSchema } from '@creativeid/types';
import { createTRPCRouter, publicProcedure } from '../trpc';

export const reportRouter = createTRPCRouter({
  /**
   * Submit a content report.
   * Can be called by authenticated users (reporter identity is recorded) or
   * anonymous visitors (reporterId stored as NULL).
   */
  create: publicProcedure
    .input(createReportSchema)
    .mutation(async ({ ctx, input }) => {
      // Resolve the caller's identity ID if authenticated; NULL for anonymous reports.
      let reporterId: string | null = null;
      if (ctx.userId) {
        const [identity] = await ctx.db
          .select({ id: identities.id })
          .from(identities)
          .where(and(eq(identities.clerkUserId, ctx.userId), isNull(identities.deletedAt)))
          .limit(1);
        reporterId = identity?.id ?? null;
      }

      await ctx.db.insert(contentReports).values({
        reporterId,
        targetType: input.targetType,
        targetId: input.targetId,
        reason: input.reason,
        detail: input.detail ?? null,
      });

      return { success: true };
    }),
});
