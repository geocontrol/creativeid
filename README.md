To get running

  # 1. Install
  pnpm install

  # 2. Fill in secrets
  cp .env.example .env.local
  # → DATABASE_URL, CLERK keys, CLERK_WEBHOOK_SECRET, R2 keys, RESEND_API_KEY, UPSTASH keys, ADMIN_SECRET

  # 3. Push schema to Neon
  pnpm db:push

  # 4. Start dev
  pnpm dev

----

# Notes:

The webhook secret (CLERK_WEBHOOK_SECRET) is used to verify that incoming webhook requests genuinely come from Clerk, not
  from a malicious third party. The handler at apps/web/app/api/webhooks/clerk/route.ts uses the svix library to validate the
  signature on every request.

  What the webhook does

  Your handler listens for two events:

  ┌──────────────┬────────────────────────────────────────────────────────────────────┐
  │    Event     │                               Action                               │
  ├──────────────┼────────────────────────────────────────────────────────────────────┤
  │ user.created │ Creates a stub identities record in your DB with the Clerk user ID │
  ├──────────────┼────────────────────────────────────────────────────────────────────┤
  │ user.deleted │ Soft-deletes the identity (sets deleted_at)                        │
  └──────────────┴────────────────────────────────────────────────────────────────────┘

  This is how your database stays in sync with Clerk's user records — Clerk is the source of truth for auth, but you need your
   own identity rows for all the profile/works/connections data.

  How to set it up in Clerk

  1. Go to clerk.com → your application → Webhooks (left sidebar)
  2. Click Add Endpoint
  3. Set the Endpoint URL to:
    - Local dev: you'll need a tunnel — use ngrok or the Clerk CLI's built-in tunnel: npx clerk dev --tunnel
    - Production: https://yourdomain.com/api/webhooks/clerk
  4. Under Subscribe to events, select:
    - user.created
    - user.deleted
  5. Click Create
  6. On the endpoint detail page, copy the Signing Secret (starts with whsec_...)
  7. Paste it into .env.local as CLERK_WEBHOOK_SECRET=whsec_...

  Local development tip

  Clerk's dashboard has a built-in test event sender — once your endpoint is registered, you can fire test user.created events
   directly from the dashboard to verify your handler works before going live.


