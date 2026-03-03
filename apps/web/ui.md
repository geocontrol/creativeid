# UI Improvement Backlog

Deferred suggestions from the initial UI review (2026-03). Items are grouped by where the
change needs to happen. Code changes are left for a future sprint; third-party service
config changes can be done independently in the relevant dashboard.

---

## Third-party Service Configuration

### Clerk Dashboard

| Setting | Action |
|---|---|
| **Sign-up form fields** | Disable "First name" and "Last name" fields in Clerk Dashboard → User & Authentication → Email, Phone, Username. creativeId captures `display_name` itself during onboarding — the Clerk name fields create duplicate, inconsistent data. |
| **Sign-up redirect** | Confirm `NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/onboarding` is set in Clerk Dashboard → Paths, and matches the env var. |
| **Sign-in redirect** | Confirm `NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/dashboard` is set in Clerk Dashboard → Paths. |
| **Social OAuth buttons** | Enable Google and Apple in Clerk Dashboard → Social connections. Magic link should remain on as the primary option. |
| **Branding** | Upload the creativeId logo and set brand colour in Clerk Dashboard → Customization so the hosted sign-in/sign-up pages feel on-brand even before the `<SignIn />` embed is fully styled. |
| **Email templates** | Customise the magic link email template in Clerk Dashboard → Emails to use the creativeId name and voice rather than the generic Clerk template. |

---

## Deferred Code Changes

### Navigation

- **Mobile nav**: The current `<nav>` is a horizontal row that wraps awkwardly on small
  screens. Replace with a collapsible hamburger menu (`Sheet` from shadcn/ui) on `md:` and
  below, keeping the horizontal nav only on desktop.
- **Active state highlight**: `NavLinks.tsx` currently marks the active link with
  `font-medium` only. Add a left-border or background-highlight treatment that makes it
  clearer which section is active, particularly on the profile sub-pages.

### Profile Edit

- **Unsaved-changes guard**: The profile edit form has no guard against navigating away
  with unsaved changes. Add a `beforeunload` event listener (or Next.js router event)
  that prompts the user if `editing === true`.
- **Real-time handle availability check**: When the user types a handle in the edit form,
  debounce a `trpc.identity.getByHandle` query to show a green tick / red cross inline
  rather than only revealing conflicts on save.
- **Inline field editing**: Consider replacing the monolithic Edit/Save flow with
  per-field inline editing (click a pencil icon next to each field). Lower friction for
  small updates.
- **Avatar upload**: The `avatarUrl` field is tracked in the schema and `ProfileCompleteness`
  checks for it, but there is no upload UI. Wire up the Cloudflare R2 upload:
  1. Add a `POST /api/upload/avatar` route that generates a presigned R2 PUT URL.
  2. Add an avatar `<img>` / placeholder with an overlay upload button on the profile page.
  3. On successful upload, call `trpc.identity.update({ avatarUrl })`.

### Dashboard

- **Demo profile link**: Add a "Preview my public profile" link on the dashboard (only
  visible when a handle is set) so users can see what visitors see without manually
  navigating to `/{handle}`.
- **Activity feed**: The "Recent works" section could be extended to show recent connection
  activity (new connections accepted, requests received) as a simple timestamped list.
  This gives the dashboard more utility as a daily landing page.

### Public Profile (`/[handle]`)

- **Open Graph image**: Add a dynamic OG image route (`/api/og/[handle]`) using
  `@vercel/og` that renders the identity name, disciplines, and CIID as a card image.
  This dramatically improves link preview quality in Slack, iMessage, and Twitter/X.
- **"Connect with" button behaviour**: The "Connect with [Name]" CTA on the public profile
  currently links to `/sign-in`. Post-login, the user lands on the dashboard, not back on
  the profile. Pass a `redirect_url` to the Clerk sign-in flow so the user returns to the
  originating profile after authentication.

### New Work Form

- **Work type labels**: `workTypeValues` renders raw strings (e.g. `film`, `exhibition`).
  Add a display label map (e.g. `Film`, `Exhibition`, `Short film`) so the select options
  read naturally. This can live in `packages/types/`.
- **Cover image upload**: The `works.coverUrl` column exists but there is no UI. Add the
  same presigned-URL pattern as for avatars.

### Connections

- **Pending request badge in nav**: The nav item "Connections" has no indicator of pending
  requests. Fetch `trpc.connection.pending` in the nav (client component) and show a
  numeric badge on the link when count > 0.
- **Connection type labels on public profile**: The accepted connections on the public
  profile page show identity cards but not the relationship type (e.g. "Collaborated with").
  Expose `type` from the `connection.list` query and render it as a sub-label under the
  name in `<IdentityCard />`.

### Accessibility

- **Focus ring visibility**: The default Tailwind `ring` focus styles are suppressed in
  some custom button and input variants. Audit all interactive elements for visible focus
  states at `prefers-reduced-motion: no-preference`.
- **Toast announcements**: The toast system should use `aria-live="polite"` region so
  screen readers announce new toasts. Verify the Radix `Toast.Viewport` renders with the
  correct ARIA attributes.

---

## Lighthouse / Performance

- **Image optimisation**: Any `<img>` tags should be replaced with Next.js `<Image />`
  from `next/image` to get automatic format conversion, lazy loading, and responsive
  sizing. Particularly important for avatars on the public profile page.
- **Font loading**: If a custom font is added later, use `next/font` for automatic
  optimisation and `font-display: swap`.
