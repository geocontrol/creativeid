import { cache } from 'react';
import { notFound } from 'next/navigation';
import { type Metadata } from 'next';
import Link from 'next/link';
import { db } from '@creativeid/db';
import { identities, works, connections } from '@creativeid/db/schema';
import { eq, and, isNull, or, inArray } from 'drizzle-orm';
import { PublicProfileHeader } from '@/components/PublicProfileHeader';
import { WorkCard } from '@/components/WorkCard';
import { IdentityCard } from '@/components/IdentityCard';

interface Props {
  params: { handle: string };
}

// cache() deduplicates calls within the same request — generateMetadata and the
// page component both call this, so without cache() we'd hit the DB twice.
const getIdentity = cache(async (handle: string) => {
  const [identity] = await db
    .select()
    .from(identities)
    .where(eq(identities.handle, handle))
    .limit(1);
  return identity ?? null;
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const identity = await getIdentity(params.handle);
  if (!identity || identity.deletedAt) return { title: 'Not found' };

  const description = identity.artistStatement ?? identity.biography?.slice(0, 160) ?? undefined;

  return {
    title: identity.displayName,
    description,
    openGraph: {
      title: `${identity.displayName} | creativeId`,
      description,
      images: identity.avatarUrl ? [{ url: identity.avatarUrl }] : [],
      url: `${process.env['NEXT_PUBLIC_APP_URL']}/${identity.handle}`,
      type: 'profile',
    },
    twitter: {
      card: 'summary',
      title: `${identity.displayName} | creativeId`,
      description,
      images: identity.avatarUrl ? [identity.avatarUrl] : [],
    },
  };
}

export default async function PublicProfilePage({ params }: Props) {
  const identity = await getIdentity(params.handle);

  // Handle not found — no identity with this handle at all
  if (!identity) notFound();

  // 410 Gone — identity existed but has been deleted.
  // Next.js App Router page components cannot set HTTP status directly; the 410
  // status code is enforced by middleware (middleware.ts checks deletedAt and
  // returns a 410 Response for deleted handles). This render path provides the
  // correct UI for both the middleware response body and direct client navigation.
  if (identity.deletedAt) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <p className="text-sm font-mono text-muted-foreground">410</p>
          <h1 className="mt-2 text-2xl font-bold">Profile no longer available</h1>
          <p className="mt-2 text-muted-foreground">
            This creativeId has been deleted by its owner.
          </p>
        </div>
      </div>
    );
  }

  // 404 for private profiles
  if (identity.visibility === 'private') notFound();

  // Fetch works and connections in parallel — independent queries.
  const [workList, connectionList] = await Promise.all([
    db
      .select()
      .from(works)
      .where(and(eq(works.createdBy, identity.id), isNull(works.deletedAt))),
    db
      .select()
      .from(connections)
      .where(
        and(
          eq(connections.status, 'accepted'),
          or(eq(connections.fromId, identity.id), eq(connections.toId, identity.id)),
        ),
      ),
  ]);

  // Get the connected identities (the other side of each connection)
  const connectedIds = connectionList
    .map((c) => (c.fromId === identity.id ? c.toId : c.fromId))
    .filter(Boolean);

  const connectedIdentities =
    connectedIds.length > 0
      ? await db
          .select({
            id: identities.id,
            ciid: identities.ciid,
            handle: identities.handle,
            displayName: identities.displayName,
            avatarUrl: identities.avatarUrl,
            disciplines: identities.disciplines,
            connectionCount: identities.connectionCount,
          })
          .from(identities)
          .where(
            and(
              inArray(identities.id, connectedIds),
              isNull(identities.deletedAt),
            ),
          )
      : [];

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-4xl items-center justify-between px-4">
          <Link href="/" className="text-sm font-semibold text-primary">
            creativeId
          </Link>
          <nav className="flex items-center gap-3">
            <Link href="/sign-in" className="text-sm text-muted-foreground hover:text-foreground">
              Sign in
            </Link>
            <Link
              href="/sign-up"
              className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Create your creativeId
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-10">
        <PublicProfileHeader identity={identity} />

        {identity.biography && (
          <section className="mt-10">
            <h2 className="mb-3 text-lg font-semibold">Biography</h2>
            <p className="whitespace-pre-line text-muted-foreground">{identity.biography}</p>
          </section>
        )}

        {workList.length > 0 && (
          <section className="mt-10">
            <h2 className="mb-4 text-lg font-semibold">Works ({workList.length})</h2>
            <div className="space-y-3">
              {workList.map((work) => (
                <WorkCard key={work.id} work={work} />
              ))}
            </div>
          </section>
        )}

        {connectedIdentities.length > 0 && (
          <section className="mt-10">
            <h2 className="mb-4 text-lg font-semibold">
              Connections ({identity.connectionCount})
            </h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {connectedIdentities.slice(0, 12).map((conn) => (
                <IdentityCard key={conn.id} identity={conn} />
              ))}
            </div>
          </section>
        )}

        <div className="mt-8">
          <Link
            href="/sign-in"
            className="inline-flex items-center gap-2 rounded-md border border-primary px-4 py-2 text-sm font-medium text-primary hover:bg-primary/5"
          >
            Connect with {identity.displayName.split(' ')[0]}
          </Link>
        </div>

        <div className="mt-16 border-t pt-6">
          <details className="group">
            <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground list-none flex items-center gap-1">
              <span className="transition-transform group-open:rotate-90">▶</span>
              Developer &amp; verification info
            </summary>
            <div className="mt-3 space-y-1 text-xs text-muted-foreground font-mono">
              <p>CIID: {identity.ciid}</p>
              {identity.contentHash && (
                <p>Content hash: {identity.contentHash.slice(0, 20)}…</p>
              )}
              <p className="mt-2 font-sans">
                <Link href={`/api/v1/identity/${identity.ciid}`} className="hover:underline">
                  View JSON API
                </Link>
                {' · '}
                <Link href={`/api/v1/verify/${identity.ciid}`} className="hover:underline">
                  Verify profile
                </Link>
              </p>
            </div>
          </details>
        </div>
      </main>
    </div>
  );
}
