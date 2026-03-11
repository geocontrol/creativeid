# Profile Photos Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow creativeId holders to upload press photos (modelled as `work_type = 'photograph'`), credit photographers, drag-reorder photos, promote any photo to their avatar, and display a Press Photos section at the bottom of their public profile.

**Architecture:** Photos extend the existing `works` table with three new columns (`display_order`, `is_avatar`, `subject_identity_id`). The `work_credits` schema is migrated to allow nullable `identity_id` for off-platform photographers. Upload uses a two-step presigned R2 URL pattern; the browser uploads directly to R2 then calls `work.create`. Drag-to-reorder uses `@dnd-kit/sortable`.

**Tech Stack:** Drizzle ORM (≥0.30.10 ✓), tRPC v11, Next.js 14 App Router, Cloudflare R2 (S3-compatible via `@aws-sdk/client-s3`), `@dnd-kit/sortable` (new dependency), Zod, shadcn/ui, Tailwind CSS

---

> **No test framework is configured in this project.** All verification steps use `pnpm typecheck` (TypeScript), `pnpm lint` (ESLint), and manual testing notes. Do not attempt to run Jest or Vitest.

---

## Chunk 1: Database Schema & Migration

**Files:**
- Modify: `packages/db/schema/works.ts`
- Modify: `packages/db/schema/workCredits.ts`

---

### Task 1: Add photograph columns to works schema

**Files:**
- Modify: `packages/db/schema/works.ts`

- [ ] **Step 1: Read the current file**

  Run: `cat packages/db/schema/works.ts`
  Confirm you see: `workType: text('work_type').notNull()`, `createdBy: uuid('created_by').references(...)`, and no `displayOrder`, `isAvatar`, or `subjectIdentityId` columns.

- [ ] **Step 2: Update the file**

  Replace the full contents of `packages/db/schema/works.ts` with:

  ```typescript
  import {
    pgTable,
    uuid,
    text,
    integer,
    boolean,
    jsonb,
    timestamp,
    index,
  } from 'drizzle-orm/pg-core';
  import { identities } from './identities';

  export const works = pgTable(
    'works',
    {
      id: uuid('id').primaryKey().defaultRandom(),
      title: text('title').notNull(),
      workType: text('work_type').notNull(),
      // 'album' | 'film' | 'play' | 'exhibition' | 'book' | 'other' | 'photograph'
      year: integer('year'),
      description: text('description'),
      url: text('url'),
      coverUrl: text('cover_url'),
      createdBy: uuid('created_by').references(() => identities.id),
      // photograph-specific columns (NULL for all other work types)
      subjectIdentityId: uuid('subject_identity_id').references(() => identities.id),
      displayOrder: integer('display_order').default(0),
      isAvatar: boolean('is_avatar').default(false),
      extensionData: jsonb('extension_data').default({}),
      createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
      updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
      deletedAt: timestamp('deleted_at', { withTimezone: true }),
    },
    (table) => ({
      subjectIdentityIdx: index('works_subject_identity_idx').on(table.subjectIdentityId),
    }),
  );

  export type Work = typeof works.$inferSelect;
  export type NewWork = typeof works.$inferInsert;
  ```

- [ ] **Step 3: Verify TypeScript compiles**

  Run: `pnpm typecheck`
  Expected: no errors related to `works.ts`. Other pre-existing errors are acceptable at this point.

---

### Task 2: Migrate work_credits to nullable identity_id with partial unique index

**Files:**
- Modify: `packages/db/schema/workCredits.ts`

- [ ] **Step 1: Read the current file**

  Run: `cat packages/db/schema/workCredits.ts`
  Confirm: `identityId` has `.notNull()` and `onDelete: 'cascade'`; there is a `unique()` constraint on `(workId, identityId, role)`.

- [ ] **Step 2: Update the file**

  Replace the full contents of `packages/db/schema/workCredits.ts` with:

  ```typescript
  import {
    pgTable,
    uuid,
    text,
    integer,
    boolean,
    timestamp,
    uniqueIndex,
  } from 'drizzle-orm/pg-core';
  import { isNotNull } from 'drizzle-orm';
  import { works } from './works';
  import { identities } from './identities';

  export const workCredits = pgTable(
    'work_credits',
    {
      id: uuid('id').primaryKey().defaultRandom(),
      workId: uuid('work_id')
        .notNull()
        .references(() => works.id, { onDelete: 'cascade' }),
      // Nullable: photographer may not be a creativeId holder.
      // ON DELETE SET NULL: if photographer's identity is deleted, credit row is kept.
      identityId: uuid('identity_id').references(() => identities.id, {
        onDelete: 'set null',
      }),
      role: text('role').notNull(),
      roleNote: text('role_note'),
      creditOrder: integer('credit_order').default(0),
      attested: boolean('attested').default(false),
      createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    },
    (table) => ({
      // Partial unique index: only enforce uniqueness when identity_id is not null.
      // NULL identity_id (off-platform photographer) is deduplicated in app logic.
      uniqueWorkIdentityRole: uniqueIndex('work_credits_unique_identity')
        .on(table.workId, table.identityId, table.role)
        .where(isNotNull(table.identityId)),
    }),
  );

  export type WorkCredit = typeof workCredits.$inferSelect;
  export type NewWorkCredit = typeof workCredits.$inferInsert;
  ```

- [ ] **Step 3: Verify TypeScript compiles**

  Run: `pnpm typecheck`
  Expected: no new errors.

- [ ] **Step 4: Generate and apply the migration**

  Run: `pnpm db:generate`
  This creates a migration file in `packages/db/migrations/`. Inspect it to confirm it:
  - Adds `subject_identity_id`, `display_order`, `is_avatar` to `works`
  - Drops NOT NULL from `work_credits.identity_id`
  - Changes cascade behaviour to SET NULL
  - Drops the old unique constraint and creates the partial unique index

  Then apply to your local dev database:
  Run: `pnpm db:push`
  Expected: schema updated with no errors.

  > **Note:** `db:push` applies the schema diff directly (bypasses migrations). This is the correct workflow for local dev per CLAUDE.md. If you are deploying to a non-dev environment, use `pnpm db:migrate` instead of `pnpm db:push` — do not run both.

- [ ] **Step 5: Commit**

  ```bash
  git add packages/db/schema/works.ts packages/db/schema/workCredits.ts packages/db/migrations/
  git commit -m "feat(db): add photograph columns to works, make work_credits.identity_id nullable"
  ```

---

## Chunk 2: Zod Schemas & Types

**Files:**
- Modify: `packages/types/schemas.ts`

---

### Task 3: Update workTypeValues and add new procedure schemas

**Files:**
- Modify: `packages/types/schemas.ts`

- [ ] **Step 1: Add `'photograph'` to workTypeValues**

  Find this line in `packages/types/schemas.ts`:
  ```typescript
  export const workTypeValues = ['album', 'film', 'play', 'exhibition', 'book', 'other'] as const;
  ```
  Replace with:
  ```typescript
  export const workTypeValues = ['album', 'film', 'play', 'exhibition', 'book', 'other', 'photograph'] as const;
  ```

- [ ] **Step 2: Update addCreditSchema to allow nullable identityId**

  Find:
  ```typescript
  export const addCreditSchema = z.object({
    workId: z.string().uuid(),
    identityId: z.string().uuid(),
    role: z.string().min(1).max(100),
    roleNote: z.string().max(200).optional().nullable(),
    creditOrder: z.number().int().min(0).optional(),
  });
  ```
  Replace with:
  ```typescript
  export const addCreditSchema = z.object({
    workId: z.string().uuid(),
    identityId: z.string().uuid().optional().nullable(), // nullable for off-platform photographers
    role: z.string().min(1).max(100),
    roleNote: z.string().max(200).optional().nullable(),
    creditOrder: z.number().int().min(0).optional(),
  });
  ```

- [ ] **Step 3: Add new procedure schemas at the end of the Work schemas section**

  After `removeCreditSchema`, add:

  ```typescript
  // ─── Photo / upload schemas ───────────────────────────────────────────────────

  export const getUploadUrlSchema = z.object({
    filename: z.string().min(1).max(255),
    contentType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
    fileSize: z.number().int().positive().max(10 * 1024 * 1024), // 10 MB
  });

  // Note: photographs are created via the existing createWorkSchema (with workType='photograph').
  // A separate createPhotographSchema is not needed — the router branches on workType server-side.

  export const reorderPhotosSchema = z.object({
    photoIds: z.array(z.string().uuid()).min(1).max(20),
  });

  export const setAsAvatarSchema = z.object({
    photoId: z.string().uuid(),
  });

  export const searchIdentitiesSchema = z.object({
    q: z.string().min(2).max(100),
  });
  ```

- [ ] **Step 4: Verify TypeScript compiles**

  Run: `pnpm typecheck`
  Expected: no errors.

- [ ] **Step 5: Commit**

  ```bash
  git add packages/types/schemas.ts
  git commit -m "feat(types): add photograph work type and upload/photo procedure schemas"
  ```

---

## Chunk 3: R2 Upload Utility

**Files:**
- Create: `apps/web/lib/r2.ts`

---

### Task 4: Create R2 client and presigned URL utility

**Files:**
- Create: `apps/web/lib/r2.ts`

- [ ] **Step 1: Install the AWS S3 SDK**

  Run: `pnpm add @aws-sdk/client-s3 @aws-sdk/s3-request-presigner --filter=@creativeid/web`

  Verify it appears in `apps/web/package.json` dependencies.

- [ ] **Step 2: Create the R2 utility**

  Create `apps/web/lib/r2.ts`:

  ```typescript
  import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
  import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
  import { customAlphabet } from 'nanoid';

  const nanoid = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', 12);

  function getR2Client(): S3Client {
    return new S3Client({
      region: 'auto',
      endpoint: `https://${process.env['R2_ACCOUNT_ID']}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: process.env['R2_ACCESS_KEY_ID']!,
        secretAccessKey: process.env['R2_SECRET_ACCESS_KEY']!,
      },
    });
  }

  function getExtension(filename: string): string {
    const ext = filename.split('.').pop()?.toLowerCase() ?? 'jpg';
    const allowed = ['jpg', 'jpeg', 'png', 'webp'];
    return allowed.includes(ext) ? ext : 'jpg';
  }

  export interface PresignedUploadResult {
    uploadUrl: string;
    key: string;
    publicUrl: string;
  }

  /**
   * Generate a presigned R2 PUT URL for a photo upload.
   * TTL: 5 minutes. The client uploads directly from the browser.
   */
  export async function generatePhotoUploadUrl(
    identityId: string,
    filename: string,
    contentType: string,
  ): Promise<PresignedUploadResult> {
    const client = getR2Client();
    const ext = getExtension(filename);
    const key = `photos/${identityId}/${nanoid()}.${ext}`;
    const bucket = process.env['R2_BUCKET_NAME']!;

    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      ContentType: contentType,
    });

    const uploadUrl = await getSignedUrl(client, command, { expiresIn: 300 });
    const publicUrl = `${process.env['R2_PUBLIC_URL']}/${key}`;

    return { uploadUrl, key, publicUrl };
  }
  ```

- [ ] **Step 3: Verify TypeScript compiles**

  Run: `pnpm typecheck`
  Expected: no errors in `r2.ts`.

- [ ] **Step 4: Commit**

  ```bash
  git add apps/web/lib/r2.ts apps/web/package.json pnpm-lock.yaml
  git commit -m "feat(web): add R2 presigned URL utility for photo uploads"
  ```

---

## Chunk 4: tRPC API — Modified Procedures

**Files:**
- Modify: `packages/api/routers/work.ts`

---

### Task 5: Update work.list, work.update, work.delete, work.addCredit

**Files:**
- Modify: `packages/api/routers/work.ts`

- [ ] **Step 1: Update the drizzle-orm import**

  At the top of `packages/api/routers/work.ts`, update the import:
  ```typescript
  import { eq, and, isNull, ne, inArray, asc } from 'drizzle-orm';
  ```

- [ ] **Step 2: Update work.list to exclude photographs**

  Find the `list` procedure query:
  ```typescript
  const workList = await ctx.db
    .select()
    .from(works)
    .where(and(eq(works.createdBy, input.identityId), isNull(works.deletedAt)));
  ```
  Replace with:
  ```typescript
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
  ```

- [ ] **Step 3: Update work.update to handle photograph authorization and block workType mutation**

  Find the authorization check in `update`:
  ```typescript
  if (existing.createdBy !== ctx.identity.id) throw new TRPCError({ code: 'FORBIDDEN' });
  ```
  Replace with:
  ```typescript
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
  ```

- [ ] **Step 4: Replace the full work.delete procedure**

  Find the `delete` procedure (starts with `/** Mutation: soft-delete own work. */`). Replace the full procedure with:

  ```typescript
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
  ```

- [ ] **Step 5: Replace the full work.addCredit procedure**

  Find the `addCredit` procedure. Replace the full procedure with:

  ```typescript
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
  ```

- [ ] **Step 6: Update work.create for photograph-specific values and skip auto-credit**

  In `work.create`, make three changes:

  **6a — Compute `displayOrder` and set `isPhoto` flag before the insert:**

  Before the `db.insert(works)` call, add:
  ```typescript
  import { sql } from 'drizzle-orm'; // add to top-of-file imports if not present

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
  ```

  **6b — Update the `db.insert(works).values(...)` call:**

  The existing insert sets `createdBy: ctx.identity.id` unconditionally. Update it so photographs get `created_by = NULL`, `subject_identity_id = caller`, and the computed `display_order`:
  ```typescript
  const [work] = await ctx.db
    .insert(works)
    .values({
      title: input.title,
      workType: input.workType,
      year: input.year ?? null,
      description: input.description ?? null,
      url: input.url ?? null,
      coverUrl: input.coverUrl ?? null,
      createdBy: isPhoto ? null : ctx.identity.id,
      subjectIdentityId: isPhoto ? ctx.identity.id : null,
      displayOrder: isPhoto ? displayOrder : 0,
    })
    .returning();
  ```

  **6c — Wrap the auto-credit insert to skip it for photographs:**

  Find the block that inserts the creator as a credit and wrap it:
  ```typescript
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
  ```

  **Why:** `created_by` is always `NULL` for photographs (spec requirement). Without setting `subjectIdentityId`, every downstream authorization check (`work.update`, `work.delete`, `work.addCredit`, `work.setAsAvatar`) will fail because they all verify `subjectIdentityId = ctx.identity.id`. Without computing `displayOrder`, every photo will have `display_order = 0` causing incorrect ordering and reorder conflicts.

- [ ] **Step 7: Verify TypeScript compiles**

  Run: `pnpm typecheck`
  Expected: no errors.

- [ ] **Step 8: Commit**

  ```bash
  git add packages/api/routers/work.ts
  git commit -m "feat(api): update work procedures for photograph authorization and nullable credits"
  ```

---

## Chunk 5: tRPC API — New Photograph Procedures

**Files:**
- Modify: `packages/api/routers/work.ts`
- Modify: `packages/api/routers/identity.ts`

---

### Task 6: Add work.listPhotos, work.reorderPhotos, work.setAsAvatar

**Files:**
- Modify: `packages/api/routers/work.ts`

- [ ] **Step 1: Add imports for new schemas**

  Update the schema import in `packages/api/routers/work.ts`:
  ```typescript
  import {
    createWorkSchema,
    updateWorkSchema,
    addCreditSchema,
    removeCreditSchema,
    reorderPhotosSchema,
    setAsAvatarSchema,
  } from '@creativeid/types';
  ```

- [ ] **Step 2: Add work.listPhotos**

  Inside `workRouter`, after the existing `list` procedure, add:

  ```typescript
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
  ```

- [ ] **Step 3: Add work.reorderPhotos**

  ```typescript
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
  ```

- [ ] **Step 4: Add work.setAsAvatar**

  ```typescript
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
  ```

- [ ] **Step 5: Verify TypeScript compiles**

  Run: `pnpm typecheck`
  Expected: no errors.

- [ ] **Step 6: Commit**

  ```bash
  git add packages/api/routers/work.ts
  git commit -m "feat(api): add listPhotos, reorderPhotos, setAsAvatar tRPC procedures"
  ```

---

### Task 7: Add /api/upload/photo route and identity.search

**Files:**
- Create: `apps/web/app/api/upload/photo/route.ts`
- Modify: `packages/api/routers/identity.ts`

**Why a separate API route for upload?** The `generatePhotoUploadUrl` utility lives in `apps/web/lib/r2.ts` (a Next.js app layer file). The tRPC router package (`packages/api/`) cannot import from `apps/web/`. Therefore the upload URL generation is a Next.js API route handler called directly by the client form.

- [ ] **Step 1: Create the upload API route**

  Create `apps/web/app/api/upload/photo/route.ts`:

  ```typescript
  import { NextRequest, NextResponse } from 'next/server';
  import { auth } from '@clerk/nextjs/server';
  import { db } from '@creativeid/db';
  import { identities, works } from '@creativeid/db/schema';
  import { eq, and, isNull } from 'drizzle-orm';
  import { generatePhotoUploadUrl } from '@/lib/r2';
  import { getUploadUrlSchema } from '@creativeid/types';

  const PHOTO_LIMIT = 20;

  export async function POST(req: NextRequest): Promise<NextResponse> {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const parsed = getUploadUrlSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors[0]?.message ?? 'Invalid input' },
        { status: 400 },
      );
    }

    // fileSize is validated by the Zod schema above (max 10 MB). R2 does not enforce
    // size server-side via presigned URL at MVP. Destructure without using fileSize
    // to avoid a TypeScript "unused variable" error in strict mode.
    const { filename, contentType } = parsed.data;

    // Resolve the caller's identity.
    const [identity] = await db
      .select({ id: identities.id })
      .from(identities)
      .where(and(eq(identities.clerkUserId, userId), isNull(identities.deletedAt)))
      .limit(1);

    if (!identity) {
      return NextResponse.json({ error: 'Identity not found' }, { status: 404 });
    }

    // Optimistic photo limit check.
    const photoCountResult = await db
      .select({ id: works.id })
      .from(works)
      .where(
        and(
          eq(works.subjectIdentityId, identity.id),
          eq(works.workType, 'photograph'),
          isNull(works.deletedAt),
        ),
      );

    if (photoCountResult.length >= PHOTO_LIMIT) {
      return NextResponse.json(
        { error: `Photo limit reached (${PHOTO_LIMIT})` },
        { status: 400 },
      );
    }

    const result = await generatePhotoUploadUrl(identity.id, filename, contentType);
    return NextResponse.json(result);
  }
  ```

  Note: `fileSize` is validated by the Zod schema (max 10 MB). No further server-side size check is needed here — the presigned URL does not enforce size on R2's side at MVP.

- [ ] **Step 2: Add identity.search to the identity router**

  First, read the current file to see what's already imported:
  Run: `cat packages/api/routers/identity.ts | head -20`
  Note the existing drizzle-orm import line. You will patch it to add `or`, `like`, `sql` if they are not already present — do not duplicate the import statement.

  Add the schema import (alongside existing imports from `@creativeid/types`):
  ```typescript
  import { searchIdentitiesSchema } from '@creativeid/types';
  ```

  Patch the drizzle-orm import to include `or`, `like`, `sql` — for example if the existing line is:
  ```typescript
  import { eq, and, isNull } from 'drizzle-orm';
  ```
  Update it to:
  ```typescript
  import { eq, and, isNull, or, like, sql } from 'drizzle-orm';
  ```
  (Only add the symbols that are not already present.)

  Add the procedure inside `identityRouter`:

  ```typescript
  /** Public: search identities by handle or display name (for photographer autocomplete). */
  search: publicProcedure
    .input(searchIdentitiesSchema)
    .query(async ({ ctx, input }) => {
      const term = `%${input.q.toLowerCase()}%`;

      const results = await ctx.db
        .select({
          id: identities.id,
          handle: identities.handle,
          displayName: identities.displayName,
          avatarUrl: identities.avatarUrl,
        })
        .from(identities)
        .where(
          and(
            isNull(identities.deletedAt),
            or(
              like(sql`lower(${identities.handle})`, term),
              like(sql`lower(${identities.displayName})`, term),
            ),
          ),
        )
        .limit(10);

      return results;
    }),
  ```

- [ ] **Step 3: Verify TypeScript compiles**

  Run: `pnpm typecheck`
  Expected: no errors.

- [ ] **Step 4: Commit**

  ```bash
  git add apps/web/app/api/upload/photo/route.ts packages/api/routers/identity.ts
  git commit -m "feat(api): add photo upload endpoint and identity.search procedure"
  ```

---

## Chunk 6: UI — PhotoUploadForm Component

**Files:**
- Create: `apps/web/components/PhotoUploadForm.tsx`

---

### Task 8: Build the photo upload form

**Files:**
- Create: `apps/web/components/PhotoUploadForm.tsx`

- [ ] **Step 1: Install @dnd-kit dependencies**

  Run: `pnpm add @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities --filter=@creativeid/web`
  Verify in `apps/web/package.json`.

- [ ] **Step 2: Create PhotoUploadForm.tsx**

  Create `apps/web/components/PhotoUploadForm.tsx`:

  ```tsx
  'use client';

  import { useState, useRef, useCallback } from 'react';
  import { trpc } from '@/lib/trpc';
  import { useToast } from '@/hooks/use-toast';

  interface PhotographerResult {
    id: string;
    handle: string | null;
    displayName: string;
    avatarUrl: string | null;
  }

  interface PhotoUploadFormProps {
    onSuccess: () => void;
    onCancel: () => void;
  }

  export function PhotoUploadForm({ onSuccess, onCancel }: PhotoUploadFormProps) {
    const { toast } = useToast();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [file, setFile] = useState<File | null>(null);
    const [preview, setPreview] = useState<string | null>(null);
    const [title, setTitle] = useState('');
    const [year, setYear] = useState('');
    const [description, setDescription] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedPhotographer, setSelectedPhotographer] = useState<PhotographerResult | null>(null);
    const [copyrightText, setCopyrightText] = useState('');
    const [uploading, setUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);

    const debouncedQ = searchQuery.length >= 2 ? searchQuery : '';
    const { data: searchResults } = trpc.identity.search.useQuery(
      { q: debouncedQ },
      { enabled: debouncedQ.length >= 2 },
    );

    const createWork = trpc.work.create.useMutation();
    const addCredit = trpc.work.addCredit.useMutation();

    const handleFileChange = useCallback((selected: File) => {
      setFile(selected);
      const reader = new FileReader();
      reader.onloadend = () => setPreview(reader.result as string);
      reader.readAsDataURL(selected);
    }, []);

    const handleDrop = useCallback(
      (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        const dropped = e.dataTransfer.files[0];
        if (dropped) handleFileChange(dropped);
      },
      [handleFileChange],
    );

    const handleSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!file || !title.trim()) return;

      try {
        setUploading(true);
        setUploadProgress(10);

        // Step 1: Get presigned URL.
        const uploadRes = await fetch('/api/upload/photo', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filename: file.name, contentType: file.type, fileSize: file.size }),
        });

        if (!uploadRes.ok) {
          const err = await uploadRes.json() as { error?: string };
          throw new Error(err.error ?? 'Upload failed');
        }

        const { uploadUrl, publicUrl } = await uploadRes.json() as {
          uploadUrl: string;
          publicUrl: string;
        };

        setUploadProgress(30);

        // Step 2: PUT file directly to R2.
        const putRes = await fetch(uploadUrl, {
          method: 'PUT',
          body: file,
          headers: { 'Content-Type': file.type },
        });
        if (!putRes.ok) throw new Error('Failed to upload file to storage');

        setUploadProgress(70);

        // Step 3: Create work record.
        // role is required by createWorkSchema; for photographs the server skips auto-credit.
        const work = await createWork.mutateAsync({
          title: title.trim(),
          workType: 'photograph',
          coverUrl: publicUrl,
          year: year ? parseInt(year, 10) : null,
          description: description.trim() || null,
          role: 'subject', // placeholder — ignored for work_type='photograph' server-side
        });

        setUploadProgress(85);

        // Step 4: Optionally add photographer credit.
        const hasCredit = selectedPhotographer ?? copyrightText.trim();
        if (hasCredit) {
          await addCredit.mutateAsync({
            workId: work.id,
            identityId: selectedPhotographer?.id ?? null,
            role: 'photographer',
            roleNote: copyrightText.trim() || null,
          });
        }

        setUploadProgress(100);
        toast({ title: 'Photo uploaded', description: `"${title}" added to your press photos.` });
        onSuccess();
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Something went wrong';
        toast({ title: 'Upload failed', description: message, variant: 'destructive' });
      } finally {
        setUploading(false);
        setUploadProgress(0);
      }
    };

    return (
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Drop zone */}
        <div
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          onClick={() => fileInputRef.current?.click()}
          className="cursor-pointer rounded-lg border-2 border-dashed border-primary/40 bg-primary/5 p-8 text-center transition hover:border-primary/70"
        >
          {preview ? (
            <img src={preview} alt="Preview" className="mx-auto max-h-40 rounded object-contain" />
          ) : (
            <>
              <p className="font-medium text-primary">Drop photo here or click to browse</p>
              <p className="mt-1 text-xs text-muted-foreground">JPEG, PNG or WebP · max 10 MB</p>
            </>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileChange(f); }}
          />
        </div>

        {/* Title */}
        <div>
          <label className="mb-1 block text-sm font-medium">
            Title <span className="text-destructive">*</span>
          </label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Headshot 2024"
            required
            className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        {/* Year */}
        <div>
          <label className="mb-1 block text-sm font-medium">
            Year <span className="text-xs text-muted-foreground">(optional)</span>
          </label>
          <input
            value={year}
            onChange={(e) => setYear(e.target.value)}
            type="number"
            min={1800}
            max={new Date().getFullYear() + 5}
            className="w-24 rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        {/* Photographer credit */}
        <div className="rounded-md border p-3 space-y-2">
          <p className="text-sm font-medium">
            Photographer credit <span className="text-xs text-muted-foreground">(optional)</span>
          </p>

          {selectedPhotographer ? (
            <div className="flex items-center justify-between rounded bg-primary/10 px-3 py-2 text-sm">
              <span className="font-medium">{selectedPhotographer.displayName}</span>
              <button type="button" onClick={() => setSelectedPhotographer(null)} className="text-muted-foreground hover:text-foreground">✕</button>
            </div>
          ) : (
            <div className="relative">
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by name or @handle…"
                className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
              {searchResults && searchResults.length > 0 && (
                <ul className="absolute z-10 mt-1 w-full rounded-md border bg-background shadow-sm">
                  {searchResults.map((r) => (
                    <li key={r.id}>
                      <button
                        type="button"
                        onClick={() => { setSelectedPhotographer(r); setSearchQuery(''); }}
                        className="w-full px-3 py-2 text-left text-sm hover:bg-muted"
                      >
                        {r.displayName}
                        {r.handle && <span className="ml-1 text-muted-foreground">@{r.handle}</span>}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <input
            value={copyrightText}
            onChange={(e) => setCopyrightText(e.target.value)}
            placeholder="© Name Year (free-text credit)"
            className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        {/* Caption */}
        <div>
          <label className="mb-1 block text-sm font-medium">
            Caption <span className="text-xs text-muted-foreground">(optional)</span>
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            maxLength={2000}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        {/* Progress */}
        {uploading && (
          <div className="h-1.5 w-full rounded-full bg-muted">
            <div className="h-1.5 rounded-full bg-primary transition-all" style={{ width: `${uploadProgress}%` }} />
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={!file || !title.trim() || uploading}
            className="flex-1 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {uploading ? 'Uploading…' : 'Upload photo'}
          </button>
          <button type="button" onClick={onCancel} disabled={uploading} className="rounded-md border px-4 py-2 text-sm">
            Cancel
          </button>
        </div>
      </form>
    );
  }
  ```

  **Note:** `createWorkSchema` requires a `role` field (for the auto-credit step). For photographs the server skips this auto-credit. Pass `role: 'subject'` as a dummy value — the router branches on `workType === 'photograph'` and discards `role`. This is acceptable at MVP; the `role` field could be made optional for photographs in a future cleanup.

- [ ] **Step 3: Verify TypeScript compiles**

  Run: `pnpm typecheck`
  Expected: no errors.

- [ ] **Step 4: Commit**

  ```bash
  git add apps/web/components/PhotoUploadForm.tsx apps/web/package.json pnpm-lock.yaml
  git commit -m "feat(ui): add PhotoUploadForm with R2 upload and photographer autocomplete"
  ```

---

## Chunk 7: UI — PhotoManager Component

**Files:**
- Create: `apps/web/components/PhotoManager.tsx`
- Modify: `apps/web/app/(app)/profile/page.tsx`

---

### Task 9: Build the photo management grid with drag-to-reorder

**Files:**
- Create: `apps/web/components/PhotoManager.tsx`

- [ ] **Step 1: Create PhotoManager.tsx**

  Create `apps/web/components/PhotoManager.tsx`:

  ```tsx
  'use client';

  import { useState } from 'react';
  import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    type DragEndEvent,
  } from '@dnd-kit/core';
  import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    useSortable,
    verticalListSortingStrategy,
  } from '@dnd-kit/sortable';
  import { CSS } from '@dnd-kit/utilities';
  import { trpc } from '@/lib/trpc';
  import { useToast } from '@/hooks/use-toast';
  import { PhotoUploadForm } from './PhotoUploadForm';
  import type { Work } from '@creativeid/db';

  const PHOTO_LIMIT = 20;

  interface SortablePhotoRowProps {
    photo: Work;
    onSetAvatar: (id: string) => void;
    onDelete: (id: string) => void;
  }

  function SortablePhotoRow({ photo, onSetAvatar, onDelete }: SortablePhotoRowProps) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: photo.id });
    const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };

    return (
      <div
        ref={setNodeRef}
        style={style}
        className={`flex items-center gap-3 rounded-lg border px-3 py-2 ${photo.isAvatar ? 'border-primary bg-primary/5' : 'border-border bg-background'}`}
      >
        <button {...attributes} {...listeners} type="button" className="cursor-grab touch-none text-muted-foreground" aria-label="Drag to reorder">⠿</button>

        {photo.coverUrl && (
          <img src={photo.coverUrl} alt={photo.title} width={40} height={40} className="h-10 w-10 flex-shrink-0 rounded object-cover" />
        )}

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{photo.title}</p>
          {photo.year && <p className="truncate text-xs text-muted-foreground">{photo.year}</p>}
        </div>

        {photo.isAvatar ? (
          <span className="whitespace-nowrap rounded-full bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground">✓ Avatar</span>
        ) : (
          <button type="button" onClick={() => onSetAvatar(photo.id)} className="whitespace-nowrap rounded-full border border-primary px-2 py-0.5 text-xs font-medium text-primary hover:bg-primary/10">Set avatar</button>
        )}

        <button type="button" onClick={() => onDelete(photo.id)} className="ml-1 text-muted-foreground hover:text-destructive" aria-label="Delete photo">✕</button>
      </div>
    );
  }

  interface PhotoManagerProps {
    identityId: string;
    initialPhotos: Work[];
  }

  export function PhotoManager({ identityId, initialPhotos }: PhotoManagerProps) {
    const { toast } = useToast();
    const [photos, setPhotos] = useState<Work[]>(
      [...initialPhotos].sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0)),
    );
    const [showUploadForm, setShowUploadForm] = useState(false);

    const utils = trpc.useUtils();
    const setAsAvatar = trpc.work.setAsAvatar.useMutation({
      onSuccess: () => { void utils.work.listPhotos.invalidate({ identityId }); toast({ title: 'Avatar updated' }); },
    });
    const deletePhoto = trpc.work.delete.useMutation({
      onSuccess: () => { void utils.work.listPhotos.invalidate({ identityId }); },
    });
    const reorderPhotos = trpc.work.reorderPhotos.useMutation();

    const sensors = useSensors(
      useSensor(PointerSensor),
      useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
    );

    const handleDragEnd = async (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const oldIndex = photos.findIndex((p) => p.id === active.id);
      const newIndex = photos.findIndex((p) => p.id === over.id);
      const reordered = arrayMove(photos, oldIndex, newIndex);
      setPhotos(reordered); // optimistic
      try {
        await reorderPhotos.mutateAsync({ photoIds: reordered.map((p) => p.id) });
      } catch {
        setPhotos(photos); // revert
        toast({ title: 'Reorder failed', variant: 'destructive' });
      }
    };

    const handleDelete = async (workId: string) => {
      if (!confirm('Delete this photo?')) return;
      setPhotos((prev) => prev.filter((p) => p.id !== workId)); // optimistic
      try {
        await deletePhoto.mutateAsync({ workId });
        toast({ title: 'Photo deleted' });
      } catch {
        void utils.work.listPhotos.invalidate({ identityId });
        toast({ title: 'Delete failed', variant: 'destructive' });
      }
    };

    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">
            Press Photos <span className="font-normal text-muted-foreground">{photos.length} / {PHOTO_LIMIT}</span>
          </h3>
          {photos.length < PHOTO_LIMIT && !showUploadForm && (
            <button type="button" onClick={() => setShowUploadForm(true)} className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground">+ Add photo</button>
          )}
        </div>

        {showUploadForm && (
          <div className="rounded-lg border p-4">
            <PhotoUploadForm
              onSuccess={() => { setShowUploadForm(false); void utils.work.listPhotos.invalidate({ identityId }); }}
              onCancel={() => setShowUploadForm(false)}
            />
          </div>
        )}

        {photos.length > 0 && (
          <>
            <p className="text-xs text-muted-foreground">Drag to reorder · first photo leads the press section</p>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={photos.map((p) => p.id)} strategy={verticalListSortingStrategy}>
                <div className="space-y-2">
                  {photos.map((photo) => (
                    <SortablePhotoRow key={photo.id} photo={photo} onSetAvatar={(id) => setAsAvatar.mutate({ photoId: id })} onDelete={handleDelete} />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          </>
        )}

        {photos.length === 0 && !showUploadForm && (
          <p className="text-sm text-muted-foreground">No press photos yet.</p>
        )}
      </div>
    );
  }
  ```

- [ ] **Step 2: Verify TypeScript compiles**

  Run: `pnpm typecheck`
  Expected: no errors.

- [ ] **Step 3: Commit**

  ```bash
  git add apps/web/components/PhotoManager.tsx
  git commit -m "feat(ui): add PhotoManager with drag-to-reorder and avatar promotion"
  ```

---

### Task 10: Wire PhotoManager into the profile edit page

**Files:**
- Modify: `apps/web/app/(app)/profile/page.tsx`

- [ ] **Step 1: Read the current profile page**

  Run: `cat "apps/web/app/(app)/profile/page.tsx"`
  Identify: where the tRPC `trpc.work.list` query is called, and where `<WorkCard />` is rendered.

- [ ] **Step 2: Add PhotoManager to the profile page**

  1. Add import at the top of the file:
     ```tsx
     import { PhotoManager } from '@/components/PhotoManager';
     ```

  2. Add a `listPhotos` query alongside the existing `work.list` query:
     ```tsx
     const { data: photos = [] } = trpc.work.listPhotos.useQuery(
       { identityId: identity?.id ?? '' },
       { enabled: !!identity?.id },
     );
     ```

  3. In the JSX, after the Works section (`<div>` containing `<WorkCard />`s), add:
     ```tsx
     {/* Press Photos */}
     {identity && (
       <div className="rounded-lg border p-6">
         <PhotoManager identityId={identity.id} initialPhotos={photos} />
       </div>
     )}
     ```

- [ ] **Step 3: Verify TypeScript compiles**

  Run: `pnpm typecheck`
  Expected: no errors.

- [ ] **Step 4: Commit**

  ```bash
  git add "apps/web/app/(app)/profile/page.tsx"
  git commit -m "feat(ui): integrate PhotoManager into profile edit page"
  ```

---

## Chunk 8: Public Profile — Press Photos Section

**Files:**
- Create: `apps/web/components/PhotoLightbox.tsx`
- Create: `apps/web/components/PressPhotosSection.tsx`
- Modify: `apps/web/app/[handle]/page.tsx`

---

### Task 11: Build PhotoLightbox and PressPhotosSection

**Files:**
- Create: `apps/web/components/PhotoLightbox.tsx`
- Create: `apps/web/components/PressPhotosSection.tsx`

- [ ] **Step 1: Create PhotoLightbox.tsx**

  Create `apps/web/components/PhotoLightbox.tsx`:

  ```tsx
  'use client';

  import { useState, useEffect, useCallback } from 'react';
  import Image from 'next/image';
  import Link from 'next/link';

  export interface LightboxPhoto {
    id: string;
    title: string;
    coverUrl: string | null;
    year: number | null;
    description: string | null;
    photographerName: string | null;
    photographerHandle: string | null;
  }

  interface PhotoLightboxProps {
    photos: LightboxPhoto[];
    initialIndex: number;
    onClose: () => void;
  }

  export function PhotoLightbox({ photos, initialIndex, onClose }: PhotoLightboxProps) {
    const [current, setCurrent] = useState(initialIndex);
    const photo = photos[current];

    const prev = useCallback(() => setCurrent((i) => Math.max(0, i - 1)), []);
    const next = useCallback(() => setCurrent((i) => Math.min(photos.length - 1, i + 1)), [photos.length]);

    useEffect(() => {
      const handler = (e: KeyboardEvent) => {
        if (e.key === 'Escape') onClose();
        if (e.key === 'ArrowLeft') prev();
        if (e.key === 'ArrowRight') next();
      };
      window.addEventListener('keydown', handler);
      return () => window.removeEventListener('keydown', handler);
    }, [onClose, prev, next]);

    if (!photo) return null;

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={onClose}>
        <div className="relative max-h-[90vh] w-full max-w-3xl overflow-hidden rounded-lg bg-background" onClick={(e) => e.stopPropagation()}>
          <button onClick={onClose} className="absolute right-3 top-3 z-10 rounded-full bg-black/50 p-1 text-white hover:bg-black/70" aria-label="Close">✕</button>

          {photo.coverUrl && (
            <div className="relative max-h-[60vh] w-full bg-black">
              <Image src={photo.coverUrl} alt={photo.title} width={900} height={600} className="mx-auto max-h-[60vh] w-auto object-contain" />
            </div>
          )}

          <div className="space-y-1 p-4">
            <p className="font-semibold">{photo.title}</p>
            {photo.year && <p className="text-sm text-muted-foreground">{photo.year}</p>}
            {photo.description && <p className="text-sm text-muted-foreground">{photo.description}</p>}
            {photo.photographerName && (
              <p className="text-sm text-muted-foreground">
                Photo:{' '}
                {photo.photographerHandle ? (
                  <Link href={`/${photo.photographerHandle}`} className="underline hover:text-foreground">{photo.photographerName}</Link>
                ) : photo.photographerName}
              </p>
            )}
          </div>

          {photos.length > 1 && (
            <div className="flex justify-between border-t px-4 py-2 text-sm text-muted-foreground">
              <button onClick={prev} disabled={current === 0} className="disabled:opacity-30">← Previous</button>
              <span>{current + 1} / {photos.length}</span>
              <button onClick={next} disabled={current === photos.length - 1} className="disabled:opacity-30">Next →</button>
            </div>
          )}
        </div>
      </div>
    );
  }
  ```

- [ ] **Step 2: Create PressPhotosSection.tsx**

  The public profile page uses direct Drizzle queries and passes pre-fetched data as props. `PressPhotosSection` is a client component (needs interactivity for lightbox), receiving data from the server page.

  Create `apps/web/components/PressPhotosSection.tsx`:

  ```tsx
  'use client';

  import { useState } from 'react';
  import Image from 'next/image';
  import { PhotoLightbox, type LightboxPhoto } from './PhotoLightbox';

  interface PressPhotosSectionProps {
    photos: LightboxPhoto[];
  }

  export function PressPhotosSection({ photos }: PressPhotosSectionProps) {
    const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

    if (photos.length === 0) return null;

    return (
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Press Photos</h2>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
          {photos.map((photo, i) => (
            <button
              key={photo.id}
              type="button"
              onClick={() => setLightboxIndex(i)}
              className="group relative aspect-square overflow-hidden rounded-md bg-muted"
              aria-label={`View ${photo.title}`}
            >
              {photo.coverUrl && (
                <Image
                  src={photo.coverUrl}
                  alt={photo.title}
                  fill
                  className="object-cover transition group-hover:scale-105"
                  sizes="(max-width: 640px) 33vw, (max-width: 768px) 25vw, 20vw"
                />
              )}
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 p-2 opacity-0 transition group-hover:opacity-100">
                <p className="truncate text-xs text-white">{photo.title}</p>
              </div>
            </button>
          ))}
        </div>

        {lightboxIndex !== null && (
          <PhotoLightbox photos={photos} initialIndex={lightboxIndex} onClose={() => setLightboxIndex(null)} />
        )}
      </section>
    );
  }
  ```

- [ ] **Step 3: Verify TypeScript compiles**

  Run: `pnpm typecheck`
  Expected: no errors.

- [ ] **Step 4: Commit**

  ```bash
  git add apps/web/components/PhotoLightbox.tsx apps/web/components/PressPhotosSection.tsx
  git commit -m "feat(ui): add PhotoLightbox and PressPhotosSection for public profile"
  ```

---

### Task 12: Wire PressPhotosSection into the public profile page

**Files:**
- Modify: `apps/web/app/[handle]/page.tsx`

- [ ] **Step 1: Read the full public profile page**

  Run: `cat "apps/web/app/[handle]/page.tsx"`
  Identify: the parallel data-fetch block (works + connections), where `<WorkCard />` renders, and the `generateMetadata` function.

- [ ] **Step 2: Add required imports**

  At the top of `apps/web/app/[handle]/page.tsx`, add:
  ```typescript
  import { asc } from 'drizzle-orm';
  import { workCredits } from '@creativeid/db/schema';
  import { PressPhotosSection } from '@/components/PressPhotosSection';
  import type { LightboxPhoto } from '@/components/PhotoLightbox';
  ```

  Note: `identities` is already imported as a table. In the photos query below you will join back to `identities` for the photographer — use a Drizzle alias to avoid naming collision with the imported `identities` table:
  ```typescript
  import { alias } from 'drizzle-orm/pg-core';
  // Then inside the page function:
  const photographerIdentities = alias(identities, 'photographer_identities');
  ```

- [ ] **Step 3: Add photograph data fetch inside the existing Promise.all block**

  Inside `PublicProfilePage`, find the existing `Promise.all([...])` that fetches works and connections in parallel. **Do not add a separate `await` after the block.** Instead, extend the existing `Promise.all` to include the photos query as a third element, like this:

  ```typescript
  const [workList, connectionList, rawPhotos] = await Promise.all([
    // existing works query — do not change
    db.select().from(works).where(...),
    // existing connections query — do not change
    db.select().from(connections).where(...),
    // NEW: photos query — add as the third array element
    db
      .select({
        id: works.id,
        title: works.title,
        coverUrl: works.coverUrl,
        year: works.year,
        description: works.description,
        displayOrder: works.displayOrder,
        photographerDisplayName: photographerIdentities.displayName,
        photographerHandle: photographerIdentities.handle,
        roleNote: workCredits.roleNote,
      })
      .from(works)
      .leftJoin(
        workCredits,
        and(eq(workCredits.workId, works.id), eq(workCredits.role, 'photographer')),
      )
      .leftJoin(photographerIdentities, eq(workCredits.identityId, photographerIdentities.id))
      .where(
        and(
          eq(works.subjectIdentityId, identity.id),
          eq(works.workType, 'photograph'),
          isNull(works.deletedAt),
        ),
      )
      .orderBy(asc(works.displayOrder)),
  ]);
  ```

  The destructured `rawPhotos` variable then feeds the mapping below:

  ```typescript
  const photos: LightboxPhoto[] = rawPhotos.map((p) => ({
    id: p.id,
    title: p.title,
    coverUrl: p.coverUrl,
    year: p.year,
    description: p.description,
    // Prefer linked identity display name; fall back to roleNote (free-text credit)
    photographerName: p.photographerDisplayName ?? p.roleNote ?? null,
    photographerHandle: p.photographerHandle ?? null,
  }));
  ```

- [ ] **Step 4: Add PressPhotosSection to JSX**

  After the Works section and Connections section in the JSX, add:
  ```tsx
  {/* Press Photos */}
  <PressPhotosSection photos={photos} />
  ```

- [ ] **Step 5: Update generateMetadata for secondary OG image**

  In `generateMetadata`, after fetching the identity, add a photograph query for the first photo:

  ```typescript
  const [firstPhoto] = await db
    .select({ coverUrl: works.coverUrl })
    .from(works)
    .where(
      and(
        eq(works.subjectIdentityId, identity.id),
        eq(works.workType, 'photograph'),
        isNull(works.deletedAt),
      ),
    )
    .orderBy(asc(works.displayOrder))
    .limit(1);

  const ogImages: { url: string }[] = [];
  if (identity.avatarUrl) ogImages.push({ url: identity.avatarUrl });
  if (firstPhoto?.coverUrl && firstPhoto.coverUrl !== identity.avatarUrl) {
    ogImages.push({ url: firstPhoto.coverUrl });
  }
  ```

  Then update the `openGraph` images field in the return:
  ```typescript
  openGraph: {
    title: `${identity.displayName} | creativeId`,
    description,
    images: ogImages,   // was: identity.avatarUrl ? [{ url: identity.avatarUrl }] : []
    url: `${process.env['NEXT_PUBLIC_APP_URL']}/${identity.handle}`,
    type: 'profile',
  },
  ```

  Also update the `twitter.images` field:
  ```typescript
  twitter: {
    card: 'summary_large_image',
    title: `${identity.displayName} | creativeId`,
    description,
    images: ogImages.map((i) => i.url),
  },
  ```

- [ ] **Step 6: Verify TypeScript and lint**

  Run: `pnpm typecheck && pnpm lint`
  Expected: zero errors.

- [ ] **Step 7: Commit**

  ```bash
  git add "apps/web/app/[handle]/page.tsx"
  git commit -m "feat(web): add Press Photos section and secondary OG image to public profile"
  ```

---

## Chunk 9: Final Verification

---

### Task 13: Smoke test and sign-off

- [ ] **Step 1: Confirm .env.example has R2 variables**

  Open `.env.example`. Verify these are present with comments:
  ```
  R2_ACCOUNT_ID=
  R2_ACCESS_KEY_ID=
  R2_SECRET_ACCESS_KEY=
  R2_BUCKET_NAME=creativeid-media
  R2_PUBLIC_URL=
  ```

- [ ] **Step 2: Final typecheck and lint**

  Run: `pnpm typecheck`
  Expected: zero errors.

  Run: `pnpm lint`
  Expected: zero errors.

- [ ] **Step 3: Manual smoke test (requires configured .env.local and running Neon + R2)**

  Start dev server: `pnpm dev`

  1. Sign in → `/profile` → "Press Photos" section is visible (empty state).
  2. Click "+ Add photo" → upload a JPEG ≤10 MB → enter title → submit → photo appears in list.
  3. Upload second photo with photographer linked (search for an existing handle).
  4. Drag to reorder → order persists on page refresh.
  5. Click "Set avatar" → avatar updates in the profile header.
  6. Delete the avatar photo → avatar clears → initials shown.
  7. Attempt to upload an 11 MB file → error message shown.
  8. Visit `/[handle]` → "Press Photos" section appears below works → click thumbnail → lightbox opens → keyboard arrows navigate → Escape closes.
  9. Confirm "Works" section on public profile does NOT include photographs.
  10. Hit `GET /api/v1/identity/:id/works` → response does NOT include photographs.
  11. View page source of `/[handle]` → confirm two `og:image` meta tags when a press photo exists.

- [ ] **Step 4: Final commit**

  ```bash
  git add .
  git commit -m "chore: final verification pass for profile photos feature"
  ```

---

## Acceptance Criteria Checklist

- [ ] A user can upload a JPEG, PNG, or WebP photo up to 10 MB.
- [ ] The photo requires a title; year, caption, and photographer credit are optional.
- [ ] A photographer can be linked by creativeId or credited as free text.
- [ ] Any uploaded photo can be set as the identity's avatar.
- [ ] Setting a photo as avatar updates `identities.avatar_url`; deleting the avatar photo clears it.
- [ ] Photos can be drag-reordered; order persists across sessions.
- [ ] The 20-photo limit is enforced; the UI shows current count.
- [ ] Press Photos section appears at the bottom of the public profile when at least one photo exists.
- [ ] Clicking a thumbnail opens a lightbox with full image and metadata.
- [ ] Photographer name links to their creativeId profile if they are on the platform.
- [ ] `work.list` does not return photographs; they appear only in the Press Photos section.
- [ ] The public profile page includes a secondary OG image tag for the first press photo when one exists and it differs from the avatar.
- [ ] All mutations reject unauthenticated or unauthorised callers.
- [ ] `pnpm typecheck` and `pnpm lint` pass with no errors.
