# Profile Photos Feature — Design Spec

**Date:** 2026-03-11
**Status:** Approved
**Scope:** Feature 1 of 2. Feature 2 (full Digital Press Kit) is a separate spec built on top of this one.

---

## Overview

Allow a creativeId holder to upload press/profile photos to their identity. Each photo is a creative work (modelled as `work_type = 'photograph'`) with a title, optional year, optional caption, and an optional photographer credit. Any photo can be promoted to the identity's avatar. Photos appear in a dedicated "Press Photos" section at the bottom of the public profile.

---

## Key Design Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Avatar vs photo library | Hybrid — dedicated avatar field, optional photo gallery; any photo can be promoted to avatar | Keeps avatar simple; gives artists a press-ready library |
| Photo data model | Extend `works` table with `work_type = 'photograph'` | Reuses existing work and credit infrastructure |
| Photographer credit | `work_credits` with `role = 'photographer'` | Consistent with the rest of the platform's credit model |
| `created_by` | Always `NULL` for photographs; authorship via `work_credits` | Avoids mixing creation-time FK with post-upload credit step |
| Record ownership | New `subject_identity_id` column on `works` | Separates authorship from ownership/authorization |
| Public profile placement | Dedicated "Press Photos" section at bottom, after works | Secondary to bio and works; still accessible to media |
| Photo limit | 20 per identity (soft limit in application logic) | Anti-abuse; generous for press use |
| Ordering | `display_order INTEGER` + drag-to-reorder in edit UI | First photo = most prominent in press section |
| Upload pattern | Presigned R2 URL; browser uploads direct to R2 | No double-transfer through server |
| R2 cleanup on delete | Deferred to Phase 2 | Soft-delete only at MVP; object remains in R2 |

---

## Data Model

### Changes to `works` table

Three new columns, all nullable and only meaningfully populated when `work_type = 'photograph'`:

```sql
display_order        INTEGER DEFAULT 0
is_avatar            BOOLEAN DEFAULT false
subject_identity_id  UUID REFERENCES identities(id)
```

**`work_type` gains one new value:** `'photograph'`

The `work_type` Zod schema in `packages/types/schemas.ts` must also be updated to include `'photograph'` in the string literal union. Without this, `work.create` with `work_type = 'photograph'` will fail runtime validation.

**Indexes required** (add to Drizzle schema in `packages/db/schema/works.ts`):
- `subject_identity_id` — index needed for authorization checks and photo list queries
- No additional indexes needed for `is_avatar` or `display_order` at MVP volume

**Invariants (enforced in application logic, not DB constraints):**
- At most one `works` row per identity has `is_avatar = true`.
- `display_order` values are unique per `subject_identity_id` (maintained on reorder).
- Maximum 20 rows with `work_type = 'photograph'` per `subject_identity_id`.

### How a photograph record is populated

| Column | Value |
|---|---|
| `work_type` | `'photograph'` |
| `title` | Required. e.g. `"Headshot 2024"` |
| `cover_url` | R2 CDN URL of the uploaded image |
| `year` | Optional |
| `description` | Optional caption |
| `created_by` | Always `NULL` for photographs — photographer authorship is captured entirely through `work_credits` (see below). The `works.created_by` column in Drizzle has no `.notNull()` modifier and is already nullable; no migration required for this column. |
| `subject_identity_id` | Artist's `identity.id` — the person whose profile this photo belongs to |
| `is_avatar` | `true` if promoted to avatar |
| `display_order` | 0-based integer; lower = higher position in press section |
| `url` | Not used for photographs |

### `work_credits` for photographer attribution

One row per photograph for the photographer:

| Column | Value |
|---|---|
| `work_id` | The photograph's `works.id` |
| `identity_id` | Photographer's `identity.id` — **nullable** if not on platform |
| `role` | `'photographer'` |
| `role_note` | Free-text copyright string, e.g. `"© Sam Chen 2024"` — used as display fallback |
| `attested` | `false` at MVP |

**Required migration:** The existing `work_credits.identity_id` column is defined as `NOT NULL` with `ON DELETE CASCADE`. This feature requires it to be nullable. A Drizzle migration must:
1. Drop the `NOT NULL` constraint from `work_credits.identity_id`.
2. Change `ON DELETE CASCADE` to `ON DELETE SET NULL` so that if a photographer's identity is deleted, the credit row is retained with `identity_id = null`.
3. The existing `UNIQUE(work_id, identity_id, role)` constraint must be replaced. PostgreSQL treats NULLs as distinct in unique constraints, which would permit duplicate off-platform rows. Replace it with a Drizzle partial unique index in `packages/db/schema/workCredits.ts`: `uniqueIndex('work_credits_unique_identity').on(workCredits.workId, workCredits.identityId, workCredits.role).where(isNotNull(workCredits.identityId))`. Partial index support requires **Drizzle ORM ≥ 0.28** — verify the installed version before implementing. For the NULL case, uniqueness is enforced in application logic inside `work.addCredit` (see Modified procedures).

### `identities.avatar_url` sync

When `work.setAsAvatar` is called:
1. Set `is_avatar = false` on all other photographs for this identity.
2. Set `is_avatar = true` on the selected photograph.
3. Copy `cover_url` → `identities.avatar_url`.

When a photograph with `is_avatar = true` is deleted:
1. Soft-delete the work row (`deleted_at = now()`).
2. Clear `identities.avatar_url` (set to `null`).

---

## File Storage

**R2 key format:**
```
photos/{identity_id}/{nanoid(12)}.{ext}
```

**Accepted types:** `image/jpeg`, `image/png`, `image/webp`

**Max file size:** 10 MB

**Upload flow:**
1. Client calls `work.getUploadUrl` with `{ filename, contentType, fileSize }`.
2. Server validates type and size, performs an optimistic check of the 20-photo limit, generates a presigned R2 PUT URL (TTL: 5 minutes), returns `{ uploadUrl, key, publicUrl }`.
3. Client PUTs the file directly to R2 using `uploadUrl`.
4. Client calls `work.create` with `work_type = 'photograph'`, `cover_url = publicUrl`, and remaining metadata. `work.create` performs a second limit check before inserting to guard against the race window between steps 2 and 4. If the second check fails, `work.create` returns 400 and the R2 object is abandoned (to be cleaned up in Phase 2). This is intentional: at MVP concurrency-induced orphan R2 objects are accepted in exchange for implementation simplicity.
5. If photographer is specified, client calls `work.addCredit` with `role = 'photographer'`.

**On deletion:** `works.deleted_at` is set. The R2 object is **not** deleted at MVP. R2 cleanup is a Phase 2 background job.

---

## tRPC API Changes

### New procedures

```typescript
work.getUploadUrl   // mutation — validates metadata, returns { uploadUrl, key, publicUrl }
                    // input: { filename: string, contentType: string, fileSize: number }
                    // auth: protected. Checks 20-photo limit before issuing URL.

work.listPhotos     // query — list photographs for an identity
                    // input: { identityId: string } — UUID (works.subject_identity_id); not a CIID
                    // returns: works[] where work_type='photograph', ordered by display_order
                    // auth: public

work.reorderPhotos  // mutation — update display_order for a set of photo IDs
                    // input: { photoIds: string[] } — ordered array, index = new display_order
                    //         Must contain ALL of the caller's non-deleted photograph IDs.
                    // auth: protected. Verifies caller owns ALL records before writing any.
                    //       Operation is atomic: if any ID is missing or belongs to another
                    //       identity the entire operation is rejected (no partial updates).
                    //       Non-existent IDs → 400. Unauthorised IDs → 403.

work.setAsAvatar    // mutation — promote a photo to avatar
                    // input: { photoId: string }
                    // auth: protected. Updates is_avatar + syncs identities.avatar_url.

```

**`identity.search`** — new procedure in the **`identity` router** (`packages/api/routers/identity.ts`):
```typescript
identity.search     // query — search identities by handle or display name
                    // input: { q: string } — min 2 chars; returns up to 10 results
                    // returns: { id, handle, displayName, avatarUrl }[]
                    // auth: public
                    // used by: <PhotoUploadForm /> photographer autocomplete
```

**Zod schemas:** Input schemas for all new procedures (`getUploadUrl`, `reorderPhotos`, `setAsAvatar`, `identity.search`) must be added to `packages/types/schemas.ts` (the existing central schema file) per the project convention before being imported into the routers.

### Modified procedures

**`work.create`** — extended to handle `work_type = 'photograph'`:
- `subjectIdentityId` is **not in the input schema** — it is derived server-side from `ctx.identity.id` and injected into the insert. Clients do not supply it.
- Sets `display_order` to `current_max + 1` for the identity's photographs
- **Branches on `work_type`:** when `work_type === 'photograph'`, the auto-add-creator-as-credit step is skipped entirely (photographer credit is added separately via `work.addCredit`). For all other `work_type` values the existing auto-credit behaviour is unchanged.

**`work.list`** — must be updated to add `WHERE work_type != 'photograph'` to the query. Photographs are fetched separately via `work.listPhotos`. The public REST API endpoint `GET /api/v1/identity/:id/works` calls `work.list` and will inherit this filter — photographs will not appear in that response. This is the intended behaviour and does not require an API version bump: photographs are exposed via the separate press photos section of the public profile, not the works list.

**`work.update`** — must be extended with photograph-aware authorization: when the target work has `work_type = 'photograph'`, ownership is verified against `subject_identity_id = ctx.identity.id` (not `created_by`, which is always NULL for photographs). For all other work types, `created_by` authorization is unchanged.

**`work.delete`** — extended for photograph cleanup:
- Authorization for photographs uses `subject_identity_id = ctx.identity.id` (not `created_by`) — same rule as all other photograph mutations.
- If deleted photo has `is_avatar = true`, clears `identities.avatar_url`.

**`work.addCredit`** — unchanged in signature; `identity_id` is nullable to support non-platform photographers. For photographs, at most one credit with `role = 'photographer'` is permitted per work; `work.addCredit` must check for an existing photographer credit and reject duplicates with a 400 error ("Photographer credit already exists — remove it before adding a new one").

### Authorization rules

All mutations follow the existing pattern — caller must own the resource:
- For photographs: authorization checks `subject_identity_id = ctx.identity.id` (not `created_by`)
- For all other work types: authorization checks `created_by = ctx.identity.id` (unchanged)

`ctx.identity.id` is resolved from `ctx.auth.userId` (the Clerk user ID) via `identity.me`, consistent with how all other protected procedures derive the caller's identity.

---

## UI Components

### Profile edit — `/profile`

**`<PhotoManager />`** (new, client component)
- "Press Photos (N / 20)" header with "+ Add photo" button
- Drag-to-reorder list using `@dnd-kit/sortable` — approved as a new dependency for this feature. Add to `apps/web/package.json`. Each row shows:
  - Drag handle
  - Thumbnail (40×40)
  - Title + copyright credit line
  - "Set avatar" outline pill (or "✓ Avatar" filled pill if current avatar)
  - Delete (✕) button with confirmation
- On drag end: calls `work.reorderPhotos`
- On "Set avatar": calls `work.setAsAvatar`
- On delete: calls `work.delete` with optimistic removal

**`<PhotoUploadForm />`** (new, client component — shown in a modal or slide-over triggered by "+ Add photo")
- Drag-and-drop zone (fallback: file input) — accepted types, max size shown
- Title field (required)
- Year field (optional)
- Photographer credit section:
  - Search field: autocomplete against `identity.search` by handle or display name
  - OR free-text copyright field (used when photographer is not on platform or search is skipped)
  - Both fields are optional; a photo can be uploaded with no photographer credit
- Caption / description field (optional)
- Upload progress indicator during R2 PUT
- Submit calls `work.getUploadUrl` → PUT to R2 → `work.create` → optionally `work.addCredit`

### Public profile — `/[handle]`

**`<PressPhotosSection />`** (new, server component)
- Fetches photographs using the server-side tRPC caller (consistent with other server components in the app — not client hooks or a raw fetch)
- Hidden entirely if the identity has zero photographs
- Renders a grid of thumbnails ordered by `display_order`
- Below each thumbnail: photo title + copyright credit; if photographer has a creativeId, their name links to their public profile
- Passes photo data to `<PhotoLightbox />` for click-to-expand

**`<PhotoLightbox />`** (new, client component)
- Triggered by thumbnail click
- Shows full image, title, year, caption, and full photographer credit
- Previous / next navigation between photos

### OpenGraph

When generating `<head>` metadata for `/[handle]`:
- Primary OG image: `identities.avatar_url` (unchanged) — rendered as the first `<meta property="og:image">` tag
- Secondary OG image: first press photo (`display_order = 0`) — rendered as a second `<meta property="og:image">` tag, added only when a press photo exists and its `cover_url` differs from `avatar_url`. Most social platforms render only the first `og:image`; the second serves platforms that support multiple images (e.g. some link unfurlers).

---

## Error Handling

| Scenario | Behaviour |
|---|---|
| File type not accepted | `work.getUploadUrl` returns 400 with message |
| File exceeds 10 MB | `work.getUploadUrl` returns 400 with message |
| 20-photo limit reached | `work.getUploadUrl` returns 400: "Photo limit reached (20)" |
| R2 PUT fails | Client shows error; `work.create` is never called; no orphan DB record |
| Deleting current avatar | `avatar_url` cleared; `is_avatar` unset; profile falls back to initials avatar |
| Reorder with non-existent IDs | `work.reorderPhotos` returns 400 if any supplied ID is not found in the DB |
| Reorder with unauthorised IDs | `work.reorderPhotos` returns 403 if any supplied ID exists but belongs to a different identity |

---

## Out of Scope (Phase 2 / DPK spec)

- DPK as a curated shareable package (separate spec)
- Download button with attribution on press photos
- R2 object deletion on soft-delete
- Image resizing / thumbnail generation (serve original at MVP)
- Photo visibility controls (photos follow the identity's `visibility` setting at MVP)
- Photographer attestation / verification

---

## Acceptance Criteria

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
