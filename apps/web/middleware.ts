import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';

// ─── Deleted-handle cache ──────────────────────────────────────────────────────
// Caches the result of the DB deletion lookup so repeated requests for the same
// handle (including non-existent ones) don't hit the DB on every invocation.
// This is a best-effort in-process cache — serverless environments have separate
// memory per instance. Replace with a KV store (e.g. Upstash) before high-traffic
// deployment if deterministic caching across instances is required.

const TTL_MS = 30_000; // 30 seconds
const MAX_CACHE_SIZE = 500;

const handleCache = new Map<string, { isDeleted: boolean; expiresAt: number }>();

function getCached(handle: string): boolean | null {
  const entry = handleCache.get(handle);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) { handleCache.delete(handle); return null; }
  return entry.isDeleted;
}

function setCached(handle: string, isDeleted: boolean): void {
  if (handleCache.size >= MAX_CACHE_SIZE) {
    handleCache.delete(handleCache.keys().next().value!);
  }
  handleCache.set(handle, { isDeleted, expiresAt: Date.now() + TTL_MS });
}

const isPublicRoute = createRouteMatcher([
  '/',
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/api/trpc(.*)',
  '/api/webhooks(.*)',
  '/api/v1(.*)',
  '/:handle', // public profile pages
]);

// Paths that are app routes, never user handles. Mirrors CLAUDE.md reserved list.
const RESERVED_PATHS = new Set([
  'api', 'admin', 'dashboard', 'settings', 'onboarding',
  'sign-in', 'sign-up', 'help', 'about', 'pricing', 'blog', 'legal',
]);

/**
 * If the request is for a single-segment path that could be a user handle,
 * return the handle string; otherwise return null.
 */
function maybeHandle(pathname: string): string | null {
  const parts = pathname.split('/').filter(Boolean);
  if (parts.length !== 1) return null;
  const segment = parts[0]!;
  if (RESERVED_PATHS.has(segment)) return null;
  return segment;
}

export default clerkMiddleware(async (auth, req) => {
  const handle = maybeHandle(req.nextUrl.pathname);

  // Return HTTP 410 if the handle belongs to a deleted identity.
  // Next.js App Router page components cannot set HTTP status directly, so we
  // intercept here. Non-deleted handles pass through to the page as normal.
  if (handle) {
    let isDeleted = getCached(handle);

    if (isDeleted === null) {
      const sql = neon(process.env['DATABASE_URL']!);
      const rows = await sql`
        SELECT deleted_at FROM identities
        WHERE handle = ${handle}
        LIMIT 1
      `;
      isDeleted = rows.length > 0 && rows[0]!.deleted_at !== null;
      setCached(handle, isDeleted);
    }

    if (isDeleted) {
      return new NextResponse(
        `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Profile no longer available</title></head>
<body style="font-family:system-ui,sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0">
<div style="text-align:center">
<p style="font-family:monospace;color:#888;font-size:.875rem">410</p>
<h1 style="margin:.5rem 0 0;font-size:1.5rem">Profile no longer available</h1>
<p style="color:#666;margin:.5rem 0 0">This creativeId has been deleted by its owner.</p>
</div></body></html>`,
        { status: 410, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
      );
    }
  }

  if (!isPublicRoute(req)) {
    const { userId } = await auth();
    if (!userId) {
      const signInUrl = new URL('/sign-in', req.url);
      signInUrl.searchParams.set('redirect_url', req.url);
      return NextResponse.redirect(signInUrl);
    }
  }
});

export const config = {
  matcher: [
    // Skip Next.js internals and static files
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
};
