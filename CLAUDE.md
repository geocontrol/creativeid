# creativeId — Claude Code Agent Briefing

> **Purpose:** This file is the authoritative briefing for Claude Code working on the creativeId MVP.
> Read it fully before writing any code. Refer back to it when making architectural decisions.

---

## Project Overview

**creativeId** is a digital identity platform for creative and cultural industry professionals.
It provides a persistent, portable, creator-owned identity — the name in the credits — that
third-party applications can link to, verify against, and build upon.

Think of it as **ORCID for the creative industries**: a neutral identity layer, not a social
network or portfolio platform.

**MVP Goal:** A creator can sign up, create their creative identity, add bio and credits,
connect to other creativeId holders, and share a verified public profile URL that any
third party can link to or query via API.

---

## Monorepo Structure

```
creativeid/
├── CLAUDE.md                  ← this file
├── package.json               ← root workspace config
├── turbo.json                 ← Turborepo pipeline
├── .env.example               ← all required env vars documented here
│
├── apps/
│   └── web/                   ← Next.js 14 frontend + API routes
│       ├── app/               ← App Router pages and layouts
│       │   ├── (marketing)/   ← public marketing pages
│       │   ├── (auth)/        ← sign-in, sign-up flows
│       │   ├── (app)/         ← authenticated app shell
│       │   │   ├── dashboard/
│       │   │   ├── profile/
│       │   │   └── settings/
│       │   └── [handle]/      ← public profile pages (e.g. /imogenheap)
│       ├── components/        ← shared React components
│       ├── lib/               ← utilities, API clients, helpers
│       └── public/
│
├── packages/
│   ├── db/                    ← Drizzle ORM schema + migrations
│   │   ├── schema/            ← one file per entity (identity, work, connection…)
│   │   ├── migrations/        ← generated migration files
│   │   └── index.ts           ← db client export
│   ├── api/                   ← tRPC router definitions
│   │   ├── routers/           ← identity, work, connection, group routers
│   │   └── index.ts           ← root router + context
│   └── types/                 ← shared TypeScript types and Zod schemas
│
└── tooling/
    ├── eslint/
    └── tsconfig/
```

---

## Tech Stack — Do Not Deviate Without Asking

| Layer | Choice | Notes |
|---|---|---|
| Framework | **Next.js 14** (App Router) | Use server components by default; client components only when needed |
| Language | **TypeScript** (strict mode) | No `any`. Use Zod for all runtime validation |
| Styling | **Tailwind CSS** + **shadcn/ui** | Install components via `npx shadcn@latest add`. Do not write raw CSS |
| API | **tRPC v11** | End-to-end type safety. All data mutations go through tRPC |
| ORM | **Drizzle ORM** | Schema-first. Generate migrations, do not hand-write SQL |
| Database | **PostgreSQL** (via **Neon** serverless) | Use JSONB for extension module fields |
| Auth | **Clerk** | Magic link + social OAuth (Google, Apple). Do not implement custom auth |
| File storage | **Cloudflare R2** | Avatars and media. Use the S3-compatible SDK |
| Email | **Resend** + **React Email** | Transactional only at MVP |
| Package manager | **pnpm** | Always use pnpm, not npm or yarn |
| Monorepo | **Turborepo** | Respect the pipeline defined in turbo.json |

---

## Environment Variables

All required env vars must be documented in `.env.example` with a comment explaining each.
Never hardcode secrets. Never commit `.env` files.

```bash
# Database
DATABASE_URL=              # Neon PostgreSQL connection string

# Auth — Clerk
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/dashboard
NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/onboarding

# File Storage — Cloudflare R2
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=creativeid-media
R2_PUBLIC_URL=             # Public CDN URL for the bucket

# Email — Resend
RESEND_API_KEY=

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

---

## Database Schema

### Core Principles

- Every table has `id` (UUID, default `gen_random_uuid()`), `created_at`, and `updated_at`.
- Use `snake_case` for column names.
- Soft-delete sensitive records — add `deleted_at TIMESTAMPTZ` — never hard-delete user data.
- All content that will be publicly signed gets a `content_hash TEXT` column.

### Entity: `identities`

```sql
id                UUID PRIMARY KEY
ciid              TEXT UNIQUE NOT NULL   -- human-readable: ciid_xxxxxxxxxxxx
clerk_user_id     TEXT NOT NULL          -- Clerk user ID. NOT UNIQUE — one Clerk account
                                         -- may own multiple identities post-MVP.
                                         -- At MVP enforce ONE identity per clerk_user_id
                                         -- in application logic, NOT via DB constraint.
                                         -- This preserves schema compatibility for the
                                         -- multi-identity feature without a migration.
is_primary        BOOLEAN DEFAULT true   -- true for the first (and at MVP, only) identity.
                                         -- When multi-identity ships, one per account is true.
handle            TEXT UNIQUE            -- URL slug, e.g. "imogenheap"
display_name      TEXT NOT NULL
legal_name        TEXT                   -- never exposed publicly
disciplines       TEXT[]                 -- e.g. ['musician', 'composer']
artist_statement  TEXT
biography         TEXT
avatar_url        TEXT
links             JSONB DEFAULT '[]'     -- [{label, url}]
visibility        TEXT DEFAULT 'public'  -- 'public' | 'connections' | 'private'
content_hash      TEXT                   -- SHA-256 of canonical JSON at publish
connection_count  INTEGER DEFAULT 0      -- denormalised; updated on connection accept/remove.
                                         -- Used for web-of-trust disambiguation (see below).
is_verified       BOOLEAN DEFAULT false
extension_data    JSONB DEFAULT '{}'     -- sector-specific fields (Phase 2)
created_at        TIMESTAMPTZ DEFAULT now()
updated_at        TIMESTAMPTZ DEFAULT now()
deleted_at        TIMESTAMPTZ
```

> **Multi-identity user story (post-MVP, design now, build later):**
> A single Clerk account will be able to own multiple creativeId identities — for example,
> a musician who also works as a theatre director may want separate, linkable personas.
> The schema is already compatible with this: `clerk_user_id` has no UNIQUE constraint.
> When the feature ships, the dashboard will show an identity switcher and onboarding will
> offer "add another identity to this account". Identities on the same account will carry
> a private `same_account` internal link that is **never exposed publicly**, preserving
> pseudonym and stage-name privacy. The connection request flow will work identically for
> cross-identity links whether or not the two identities share an account.

### Entity: `works`

```sql
id            UUID PRIMARY KEY
title         TEXT NOT NULL
work_type     TEXT NOT NULL    -- 'album' | 'film' | 'play' | 'exhibition' | 'book' | 'other'
year          INTEGER
description   TEXT
url           TEXT             -- external link (Spotify, IMDB, etc.)
cover_url     TEXT
created_by    UUID REFERENCES identities(id)
extension_data JSONB DEFAULT '{}'
created_at    TIMESTAMPTZ DEFAULT now()
updated_at    TIMESTAMPTZ DEFAULT now()
deleted_at    TIMESTAMPTZ
```

### Entity: `work_credits`

Junction between identity and work. One row per person per work.

```sql
id           UUID PRIMARY KEY
work_id      UUID REFERENCES works(id) ON DELETE CASCADE
identity_id  UUID REFERENCES identities(id) ON DELETE CASCADE
role         TEXT NOT NULL    -- 'composer', 'performer', 'director', 'photographer' …
role_note    TEXT             -- free text detail, e.g. "lead guitar"
credit_order INTEGER DEFAULT 0
attested     BOOLEAN DEFAULT false
created_at   TIMESTAMPTZ DEFAULT now()

UNIQUE(work_id, identity_id, role)
```

### Entity: `connections`

Directed, typed graph edges between identities.

```sql
id            UUID PRIMARY KEY
from_id       UUID REFERENCES identities(id) ON DELETE CASCADE
to_id         UUID REFERENCES identities(id) ON DELETE CASCADE
type          TEXT NOT NULL    -- 'collaborated_with' | 'bio_photo_by' | 'managed_by' | 'mentored_by'
note          TEXT
status        TEXT DEFAULT 'pending'  -- 'pending' | 'accepted' | 'declined'
initiated_by  UUID REFERENCES identities(id)
created_at    TIMESTAMPTZ DEFAULT now()
updated_at    TIMESTAMPTZ DEFAULT now()

UNIQUE(from_id, to_id, type)
```

### Web-of-Trust & Handle Disambiguation

Handles are **first-come-first-served** at claim time. There is no formal dispute process
at MVP — that would generate disproportionate support overhead. Instead, the platform uses
a **web-of-trust model** for disambiguation, inspired by the Creative Passport approach.

The core insight: if two people both claim the handle `imogenheap`, the one with the
largest, most-connected verified network is almost certainly the real one. Connections
require mutual acceptance, so a high connection count is hard to fake at scale.

**How it works:**

- `identities.connection_count` is maintained in real time (increment on accept, decrement
  on remove). It is visible on the public profile.
- When search returns multiple identities with the same `display_name`, results are ordered
  by `connection_count` descending. The best-connected identity surfaces first.
- The public profile page shows a `<TrustIndicator />` component: a connection count with
  a human label (e.g. "47 verified connections") and a graph depth hint ("connected to
  3 identities you know" when authenticated).
- There is **no claim/dispute form**. If someone believes their handle has been squatted,
  the route is: grow your connection network so you rank above the squatter in search.
  An admin override route exists in the backend (see below) but is not exposed as a
  self-service flow.

**Connection acceptance model:**

Accepting a connection is a deliberate, meaningful act — not a passive follow. The UX
should reflect this: frame it as "confirming you have a real creative relationship with
this person", not just "approving a follower". Future Phase 2 enhancement: optional
in-person or video-verified acceptance (QR code / presence token), following the
Creative Passport model.

**Admin handle override (backend only, no UI at MVP):**

```typescript
// packages/api/routers/admin.ts
// Protected by ADMIN_SECRET env var check — not exposed via OAuth.
// Used only in egregious squatting cases.
admin.reassignHandle   // mutation — move a handle from one identity to another
admin.clearHandle      // mutation — remove a handle, returning it to unclaimed
```

**Reserved handles:** see the URL rules section. Add to the reserved list if new routes
are added to the app.

### Entity: `groups`

Collections of identities (bands, companies, theatre companies).

```sql
id            UUID PRIMARY KEY
name          TEXT NOT NULL
handle        TEXT UNIQUE
group_type    TEXT NOT NULL   -- 'band' | 'theatre_company' | 'collective' | 'production'
description   TEXT
avatar_url    TEXT
founded_year  INTEGER
disbanded_year INTEGER        -- NULL = active
created_by    UUID REFERENCES identities(id)
created_at    TIMESTAMPTZ DEFAULT now()
updated_at    TIMESTAMPTZ DEFAULT now()
deleted_at    TIMESTAMPTZ
```

### Entity: `group_memberships`

```sql
id          UUID PRIMARY KEY
group_id    UUID REFERENCES groups(id) ON DELETE CASCADE
identity_id UUID REFERENCES identities(id) ON DELETE CASCADE
role        TEXT            -- 'member' | 'founder' | 'admin'
joined_at   DATE
left_at     DATE            -- NULL = current member
created_at  TIMESTAMPTZ DEFAULT now()
```

---

## tRPC Routers

Organise routers in `packages/api/routers/`. Each router is a file.

### `identity` router

```typescript
// Procedures to implement:
identity.me          // query  — fetch the authenticated user's identity
identity.getByHandle // query  — public, fetch by handle string
identity.getById     // query  — public, fetch by UUID
identity.create      // mutation — create identity record after Clerk onboarding
identity.update      // mutation — update own identity fields
identity.setHandle   // mutation — claim a handle (validate uniqueness + slug rules)
identity.publish     // mutation — sign and publish profile (generates content_hash)
identity.delete      // mutation — soft-delete own identity
```

### `work` router

```typescript
work.list         // query  — list works for an identity (public or own)
work.getById      // query  — single work with credits
work.create       // mutation — create a work, auto-add creator as a credit
work.update       // mutation — update own work
work.delete       // mutation — soft-delete
work.addCredit    // mutation — add a collaborator credit to a work
work.removeCredit // mutation — remove a credit (own works only)
```

### `connection` router

```typescript
connection.list      // query  — list accepted connections for an identity
connection.pending   // query  — list pending requests (received)
connection.request   // mutation — send a connection request
connection.accept    // mutation — accept a pending request
connection.decline   // mutation — decline a request
connection.remove    // mutation — remove an accepted connection
```

### `group` router (Phase 1 — scaffold now, full impl Phase 1)

```typescript
group.getById     // query
group.listMembers // query
group.create      // mutation
group.update      // mutation
group.addMember   // mutation
group.removeMember // mutation
```

---

## Public REST API

Alongside tRPC (for the web app), expose a read-only public REST API for third-party
consumers. These routes live in `apps/web/app/api/v1/`.

```
GET /api/v1/identity/:id          — identity by UUID or CIID
GET /api/v1/identity/:id/works    — paginated works list
GET /api/v1/identity/:id/connections — public connections
GET /api/v1/work/:id              — single work with credits
GET /api/v1/verify/:id            — returns content_hash + computed hash for verification
```

**API response envelope:**

```json
{
  "data": { ... },
  "meta": {
    "ciid": "ciid_xxxxxxxxxxxx",
    "content_hash": "sha256:abc123...",
    "generated_at": "2026-03-01T12:00:00Z"
  }
}
```

Rate limit: 100 req/min per IP. Use Upstash Redis for rate limiting middleware.

---

## Authentication & Onboarding Flow

Authentication is handled entirely by **Clerk**. Do not build custom auth.

### Sign-up → Onboarding flow:

1. User signs up via Clerk (magic link or Google/Apple OAuth).
2. Clerk `user.created` webhook fires → create a stub `identities` record in the DB
   with `clerk_user_id` set. Do not block the webhook response.
3. After sign-in, Clerk redirects to `/onboarding`.
4. `/onboarding` is a multi-step form:
   - Step 1: Display name + disciplines (required to proceed)
   - Step 2: Artist statement / biography (optional, skippable)
   - Step 3: Claim a handle (optional, skippable — can be set later)
5. On completion redirect to `/dashboard`.

### Clerk webhook handler

Lives at `apps/web/app/api/webhooks/clerk/route.ts`.
Verify webhook signature using `svix`. Handle events:
- `user.created` → create identity stub
- `user.deleted` → soft-delete identity, set `deleted_at`

---

## Public Profile Pages

Route: `apps/web/app/[handle]/page.tsx`

- Server component. Fetches identity by handle.
- If `deleted_at` is set → return 410 Gone.
- If `visibility === 'private'` → return 404.
- Renders: avatar, display name, disciplines badges, artist statement, biography,
  works list, connections count.
- Includes `<head>` Open Graph tags for rich link previews.
- The page URL is the canonical public identity URL.

**URL rules for handles:**
- 3–30 characters
- Lowercase alphanumeric + hyphens only
- Cannot start or end with a hyphen
- Reserved words blocked: `api`, `admin`, `dashboard`, `settings`, `onboarding`,
  `sign-in`, `sign-up`, `help`, `about`, `pricing`, `blog`, `legal`

---

## Content Signing

When a user "publishes" their profile, generate a content hash:

```typescript
import { createHash } from 'crypto';

function generateContentHash(identity: PublicIdentityPayload): string {
  const canonical = JSON.stringify({
    ciid: identity.ciid,
    display_name: identity.display_name,
    disciplines: identity.disciplines,
    artist_statement: identity.artist_statement,
    biography: identity.biography,
    published_at: new Date().toISOString(),
  }, null, 0); // no whitespace — deterministic

  return 'sha256:' + createHash('sha256').update(canonical, 'utf8').digest('hex');
}
```

Store the hash in `identities.content_hash`. The `/api/v1/verify/:id` endpoint recomputes
the hash from current data and returns both values so consumers can check for drift.

This is a pragmatic MVP signing mechanism. Phase 3 will upgrade to Ed25519 keypairs.

---

## CIID Generation

The creativeId identifier format is `ciid_` followed by 12 lowercase alphanumeric characters.

```typescript
import { customAlphabet } from 'nanoid';

const nanoid = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', 12);

export function generateCiid(): string {
  return `ciid_${nanoid()}`;
}
```

Generate the CIID at identity creation time. It is immutable — never regenerate it.

---

## Key UI Pages & Components

### Pages to build (MVP)

| Route | Description |
|---|---|
| `/` | Marketing landing page |
| `/sign-in` `/sign-up` | Clerk-hosted or Clerk `<SignIn />` component |
| `/onboarding` | Multi-step onboarding wizard |
| `/dashboard` | Authenticated home — profile completeness, recent activity |
| `/profile` | Edit own identity — all fields, works, connections |
| `/profile/works/new` | Add a work |
| `/profile/connections` | Manage connections — pending, accepted |
| `/settings` | Account settings (delegates to Clerk `<UserProfile />`) |
| `/[handle]` | Public profile page |

### Reusable components to build

- `<IdentityCard />` — compact card: avatar, name, disciplines. Used in search results, connection lists.
- `<WorkCard />` — title, type badge, year, role. Used in profile and work lists.
- `<DisciplineBadge />` — coloured pill for discipline labels.
- `<ConnectionRequest />` — accept / decline UI for pending requests.
- `<ProfileCompleteness />` — progress indicator shown on dashboard.
- `<PublicProfileHeader />` — avatar + name + disciplines for the public profile page.
- `<SignedBadge />` — small indicator shown when a profile has a valid content hash.

---

## Coding Conventions

### General

- **TypeScript strict mode** everywhere. No `any`, no `@ts-ignore` without explanation.
- **Zod schemas** for all user input validation. Define schemas in `packages/types/`.
- **Server components** by default in Next.js App Router. Add `'use client'` only when
  using hooks, browser APIs, or event handlers.
- **Error handling:** use `Result` types or throw descriptive errors. Never swallow errors silently.
- All database access goes through Drizzle — no raw SQL except in migrations.
- All authenticated mutations must verify the caller owns the resource being mutated.
  Never trust a client-supplied identity ID — always derive it from `auth().userId` via Clerk.

### File naming

- React components: `PascalCase.tsx`
- Utilities / helpers: `camelCase.ts`
- Route handlers: `route.ts` (Next.js convention)
- DB schema files: `schema/[entity].ts`
- tRPC routers: `routers/[entity].ts`

### Commit messages

Use conventional commits: `feat:`, `fix:`, `chore:`, `refactor:`, `docs:`, `test:`

---

## MVP Acceptance Criteria

The MVP is done when all of the following are true:

- [ ] A new user can sign up, complete onboarding, and have a publicly accessible profile URL.
- [ ] A user can add at least 3 works to their profile with title, type, year and role.
- [ ] A user can send a connection request to another user and have it accepted.
- [ ] Accepted connections are visible on both public profiles.
- [ ] The public profile page loads without authentication and renders correctly in a social link preview.
- [ ] `GET /api/v1/identity/:id` returns a valid JSON response with correct envelope and content hash.
- [ ] `GET /api/v1/verify/:id` returns matching hashes for an unmodified published profile.
- [ ] A user can delete their account and the public profile returns 410 Gone.
- [ ] All tRPC mutations reject unauthenticated calls with a 401.
- [ ] All tRPC mutations reject calls from users attempting to modify another user's data with a 403.
- [ ] Lighthouse score ≥ 90 on the public profile page (performance + accessibility).
- [ ] No TypeScript errors (`pnpm typecheck` passes).
- [ ] No ESLint errors (`pnpm lint` passes).

---

## What NOT to Build at MVP

Do not build any of the following. They are Phase 2 or later. If you find yourself
reaching for these, stop and check back.

- Sector-specific extension modules (music fields, theatre productions, film credits).
- Groups / bands / companies as first-class entities (scaffold the schema, do not build UI).
- Third-party OAuth / developer API keys.
- Attestation / verification flows.
- Native mobile apps.
- Payments or subscription tiers.
- Email notifications beyond transactional onboarding emails.
- A graph visualisation UI.
- Any form of recommendation or discovery algorithm.

---

## Content Moderation Policy

**Model: reactive moderation.** There is no pre-publication review. Creators are incentivised
to keep their own content accurate and professional — their biography and artist statement
is what venues, commissioners, and collaborators will read. The platform relies on this
self-interest rather than heavy-handed gatekeeping.

### Report flow

Every public profile and work has a `Report` link. Submitting a report creates a record
in the `content_reports` table and sends an email to the moderation queue.

```sql
-- Entity: content_reports
id              UUID PRIMARY KEY
reporter_id     UUID REFERENCES identities(id)  -- NULL if reported anonymously
target_type     TEXT NOT NULL   -- 'identity' | 'work' | 'work_credit'
target_id       UUID NOT NULL
reason          TEXT NOT NULL   -- 'offensive' | 'inaccurate' | 'impersonation' | 'spam' | 'other'
detail          TEXT            -- free text from reporter
status          TEXT DEFAULT 'open'   -- 'open' | 'reviewed' | 'actioned' | 'dismissed'
reviewed_by     TEXT            -- admin identifier
reviewed_at     TIMESTAMPTZ
created_at      TIMESTAMPTZ DEFAULT now()
```

### What happens on review

- **Offensive / harmful content:** content removed, identity warned. Repeat violations → account suspension.
- **Inaccurate credit claim:** the disputed `work_credit` row is flagged; the work owner
  is notified to review. Neither side's content is removed pending resolution.
- **Impersonation:** escalated to admin handle review. Connection count is checked as a
  trust signal — the higher-connected identity is presumed authentic.
- **Spam:** removed without warning.

No automated content filtering at MVP. Volume is expected to be low; a single admin
email alias is sufficient. Add `content_reports` monitoring to the admin backlog from day one.

---

## Getting Started

```bash
# 1. Install dependencies
pnpm install

# 2. Copy env vars and fill in values
cp .env.example .env.local

# 3. Push DB schema (first time)
pnpm db:push

# 4. Run dev server
pnpm dev
```

### Useful scripts

```bash
pnpm dev          # start all apps in dev mode (Turborepo)
pnpm build        # production build
pnpm typecheck    # tsc --noEmit across all packages
pnpm lint         # ESLint across all packages
pnpm db:push      # push Drizzle schema to DB (dev)
pnpm db:generate  # generate migration files
pnpm db:migrate   # run pending migrations
pnpm db:studio    # open Drizzle Studio
```

---

## Decision Log

Record significant architectural decisions here so future agents and contributors
understand the reasoning.

| Date | Decision | Rationale |
|---|---|---|
| 2026-03 | tRPC over plain REST for app API | End-to-end type safety; single source of truth for input schemas |
| 2026-03 | Clerk for auth | Magic link + social OAuth without custom auth complexity at MVP |
| 2026-03 | JSONB for extension_data | Avoids schema migrations per sector module; readable in SQL |
| 2026-03 | SHA-256 content hash (not Ed25519) | Pragmatic MVP; full keypair signing is Phase 3 |
| 2026-03 | Groups scaffolded but not surfaced in UI | Avoids complexity creep; schema stability needed before UI |
| 2026-03 | `clerk_user_id` not UNIQUE in DB | Enables multi-identity per account post-MVP without a breaking migration |
| 2026-03 | Handles first-come-first-served, no dispute form | Dispute forms generate support overhead; web-of-trust + connection count is the disambiguation mechanism |
| 2026-03 | Reactive moderation only | Creators are self-motivated to maintain accurate bios; low expected volume at MVP |

---

## Resolved Product Decisions

These questions were open at v0.1 and have now been answered by the product owner.
Claude Code should treat these as firm requirements.

### Disciplines at launch

The following values are the complete, fixed enum for MVP. Do not add others without
explicit instruction.

```typescript
export const DISCIPLINES = [
  'musician',
  'composer',
  'producer',
  'visual-artist',
  'photographer',
  'actor',
  'director',
  'playwright',
  'choreographer',
  'designer',
  'writer',
  'other',
] as const;

export type Discipline = typeof DISCIPLINES[number];
```

### Multiple identities

**MVP:** one identity per Clerk account, enforced in application logic (not DB constraint).
The schema supports multiple identities — `clerk_user_id` is not unique at DB level.

**Post-MVP user story (design now, build after MVP):**
> *As a creator who works in multiple disciplines under different names, I want to create
> a second creativeId linked to the same account, so I can keep my personas separate
> while managing them from one login.*

Implementation notes for when this ships:
- Dashboard gets an identity switcher (dropdown, top of nav).
- Onboarding gains an "add another identity" exit path.
- Each identity is fully independent: separate handle, bio, works, connections.
- The fact that two identities share an account is **never exposed publicly** — this
  protects stage names, pen names, and pseudonym privacy.
- A user may have at most **5 identities** per account (anti-abuse limit, configurable).

### Handles

**First-come-first-served.** No self-service dispute or claim form. Disambiguation is
handled by the web-of-trust model (see the Connections section). Admin backend override
exists for egregious squatting but is not a public-facing process.

### Content moderation

**Reactive only.** No pre-publication review. Report links on all public content.
See the Content Moderation Policy section for the full flow and `content_reports` schema.
