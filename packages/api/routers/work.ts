import { TRPCError } from '@trpc/server';
import { eq, and, isNull, ne, sql, inArray, asc } from 'drizzle-orm';
import { z } from 'zod';
import { works, workCredits, identities } from '@creativeid/db/schema';
import {
  createWorkSchema,
  updateWorkSchema,
  addCreditSchema,
  removeCreditSchema,
  reorderPhotosSchema,
  setAsAvatarSchema,
} from '@creativeid/types';
import { createTRPCRouter, publicProcedure, protectedProcedure } from '../trpc';

export const workRouter = createTRPCRouter({
  /** Public: list works for an identity (by identity UUID). Excludes photographs. */
  list: publicProcedure
    .input(z.object({ identityId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      // Respect the identity's visibility setting: private identities' works
      // must not be returned to unauthenticated or unconnected callers.
      const [identity] = await ctx.db
        .select({ visibility: identities.visibility, deletedAt: identities.deletedAt })
        .from(identities)
        .where(eq(identities.id, input.identityId))
        .limit(1);

      if (!identity || identity.deletedAt !== null || identity.visibility === 'private') {
        throw new TRPCError({ code: 'NOT_FOUND' });
      }

      const workList = await ctx.db
        .select()
        .from(works)
        .where(
          and(
            eq(works.createdBy, input.identityId),
            isNull(works.deletedAt),
            ne(works.workType, 'photograph'),
          ),
        );

      return workList;
    }),

  /** Public: list photographs for an identity (by subject_identity_id UUID). */
  listPhotos: publicProcedure
    .input(z.object({ identityId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [identity] = await ctx.db
        .select({ visibility: identities.visibility, deletedAt: identities.deletedAt })
        .from(identities)
        .where(eq(identities.id, input.identityId))
        .limit(1);

      if (!identity || identity.deletedAt !== null || identity.visibility === 'private') {
        throw new TRPCError({ code: 'NOT_FOUND' });
      }

      const photos = await ctx.db
        .select()
        .from(works)
        .where(
          and(
            eq(works.subjectIdentityId, input.identityId),
            eq(works.workType, 'photograph'),
            isNull(works.deletedAt),
          ),
        )
        .orderBy(asc(works.displayOrder));

      return photos;
    }),

  /** Mutation: atomically update display_order for all of the caller's photographs. */
  reorderPhotos: protectedProcedure
    .input(reorderPhotosSchema)
    .mutation(async ({ ctx, input }) => {
      if (!ctx.identity) throw new TRPCError({ code: 'NOT_FOUND' });

      const { photoIds } = input;

      // Fetch all supplied IDs in one query.
      const photos = await ctx.db
        .select({ id: works.id, subjectIdentityId: works.subjectIdentityId })
        .from(works)
        .where(and(inArray(works.id, photoIds), isNull(works.deletedAt)));

      // Check for non-existent IDs (atomic: reject all on any failure).
      if (photos.length !== photoIds.length) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'One or more photo IDs not found.',
        });
      }

      // Check all belong to the caller (atomic: reject all on any unauthorised ID).
      const unauthorised = photos.filter((p) => p.subjectIdentityId !== ctx.identity!.id);
      if (unauthorised.length > 0) {
        throw new TRPCError({ code: 'FORBIDDEN' });
      }

      // Apply new display_order values.
      await Promise.all(
        photoIds.map((id, index) =>
          ctx.db
            .update(works)
            .set({ displayOrder: index, updatedAt: new Date() })
            .where(eq(works.id, id)),
        ),
      );

      return { success: true };
    }),

  /** Mutation: promote a photograph to the identity's avatar. */
  setAsAvatar: protectedProcedure
    .input(setAsAvatarSchema)
    .mutation(async ({ ctx, input }) => {
      if (!ctx.identity) throw new TRPCError({ code: 'NOT_FOUND' });

      const [photo] = await ctx.db
        .select()
        .from(works)
        .where(
          and(
            eq(works.id, input.photoId),
            eq(works.workType, 'photograph'),
            isNull(works.deletedAt),
          ),
        )
        .limit(1);

      if (!photo) throw new TRPCError({ code: 'NOT_FOUND' });
      if (photo.subjectIdentityId !== ctx.identity.id) throw new TRPCError({ code: 'FORBIDDEN' });

      // Clear is_avatar on all other photos for this identity.
      await ctx.db
        .update(works)
        .set({ isAvatar: false, updatedAt: new Date() })
        .where(
          and(
            eq(works.subjectIdentityId, ctx.identity.id),
            eq(works.workType, 'photograph'),
            isNull(works.deletedAt),
          ),
        );

      // Set is_avatar on this photo.
      await ctx.db
        .update(works)
        .set({ isAvatar: true, updatedAt: new Date() })
        .where(eq(works.id, input.photoId));

      // Sync identities.avatar_url.
      await ctx.db
        .update(identities)
        .set({ avatarUrl: photo.coverUrl, updatedAt: new Date() })
        .where(eq(identities.id, ctx.identity.id));

      return { success: true };
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

      // Respect the creator identity's visibility setting.
      const [creator] = await ctx.db
        .select({ visibility: identities.visibility, deletedAt: identities.deletedAt })
        .from(identities)
        .where(eq(identities.id, work.createdBy!))
        .limit(1);

      if (!creator || creator.deletedAt !== null || creator.visibility === 'private') {
        throw new TRPCError({ code: 'NOT_FOUND' });
      }

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

      const isPhoto = input.workType === 'photograph';
      let displayOrder = 0;
      if (isPhoto) {
        const [maxRow] = await ctx.db
          .select({ max: sql<number>`MAX(${works.displayOrder})` })
          .from(works)
          .where(
            and(
              eq(works.subjectIdentityId, ctx.identity.id),
              eq(works.workType, 'photograph'),
              isNull(works.deletedAt),
            ),
          );
        displayOrder = (maxRow?.max ?? -1) + 1;
      }

      const [work] = await ctx.db
        .insert(works)
        .values({
          ...workData,
          createdBy: isPhoto ? null : ctx.identity.id,
          subjectIdentityId: isPhoto ? ctx.identity.id : null,
          displayOrder: isPhoto ? displayOrder : 0,
        })
        .returning();

      // Photographs: authorship is captured via work.addCredit — skip auto-credit.
      if (!isPhoto) {
        await ctx.db.insert(workCredits).values({
          workId: work!.id,
          identityId: ctx.identity.id,
          role,
          roleNote: roleNote ?? null,
          creditOrder: 0,
        });
      }

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

      // Block changing workType to or from 'photograph' — photograph rows have NULL created_by
      // and non-photograph rows have NULL subjectIdentityId; crossing the boundary is invalid.
      if (updateData.workType !== undefined && updateData.workType !== existing.workType) {
        const crossingPhotoBoundary =
          existing.workType === 'photograph' || updateData.workType === 'photograph';
        if (crossingPhotoBoundary) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Cannot change work type to or from photograph.',
          });
        }
      }

      const isPhoto = existing.workType === 'photograph';
      const ownerId = isPhoto ? existing.subjectIdentityId : existing.createdBy;
      // Guard: a photograph with a missing subjectIdentityId is a data integrity error — reject cleanly.
      if (!ownerId) throw new TRPCError({ code: 'NOT_FOUND' });
      if (ownerId !== ctx.identity.id) throw new TRPCError({ code: 'FORBIDDEN' });

      const [updated] = await ctx.db
        .update(works)
        .set({ ...updateData, updatedAt: new Date() })
        .where(eq(works.id, workId))
        .returning();

      return updated!;
    }),

  /** Mutation: soft-delete own work. Clears avatar_url if deleting the current avatar photo. */
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

      const isPhoto = existing.workType === 'photograph';
      const ownerId = isPhoto ? existing.subjectIdentityId : existing.createdBy;
      // Guard: null ownerId means a data integrity issue — reject with NOT_FOUND, not FORBIDDEN.
      if (!ownerId) throw new TRPCError({ code: 'NOT_FOUND' });
      if (ownerId !== ctx.identity.id) throw new TRPCError({ code: 'FORBIDDEN' });

      await ctx.db
        .update(works)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(eq(works.id, input.workId));

      // If this photo was the avatar, clear it.
      if (isPhoto && existing.isAvatar) {
        await ctx.db
          .update(identities)
          .set({ avatarUrl: null, updatedAt: new Date() })
          .where(eq(identities.id, ctx.identity.id));
      }

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

      // Authorization: photographs use subjectIdentityId, others use createdBy.
      const isPhoto = work.workType === 'photograph';
      const ownerId = isPhoto ? work.subjectIdentityId : work.createdBy;
      if (!ownerId) throw new TRPCError({ code: 'NOT_FOUND' });
      if (ownerId !== ctx.identity.id) throw new TRPCError({ code: 'FORBIDDEN' });

      // For photographs: only one photographer credit allowed.
      if (isPhoto && input.role === 'photographer') {
        const [existingPhotographer] = await ctx.db
          .select({ id: workCredits.id })
          .from(workCredits)
          .where(
            and(eq(workCredits.workId, input.workId), eq(workCredits.role, 'photographer')),
          )
          .limit(1);

        if (existingPhotographer) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Photographer credit already exists — remove it before adding a new one.',
          });
        }
      }

      const [credit] = await ctx.db
        .insert(workCredits)
        .values({
          workId: input.workId,
          identityId: input.identityId ?? null,
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

      const isPhoto = work.workType === 'photograph';
      const ownerId = isPhoto ? work.subjectIdentityId : work.createdBy;
      if (!ownerId) throw new TRPCError({ code: 'NOT_FOUND' });
      if (ownerId !== ctx.identity.id) throw new TRPCError({ code: 'FORBIDDEN' });

      // Prevent removing the creator's own credit — a work must always have at
      // least one credited identity. For non-photographs, createdBy is the creator.
      // For photographs, there is no concept of "creator credit" — they only have
      // credits added via work.addCredit. So this check only applies to non-photos.
      if (!isPhoto && credit.identityId === work.createdBy) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Cannot remove the creator credit. Transfer work ownership first.',
        });
      }

      await ctx.db.delete(workCredits).where(eq(workCredits.id, input.creditId));

      return { success: true };
    }),
});
