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

async function getIdentity(handle: string) {
  const [identity] = await db
    .select()
    .from(identities)
    .where(and(eq(identities.handle, handle), isNull(identities.deletedAt)))
    .limit(1);
  return identity;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const identity = await getIdentity(params.handle);
  if (!identity) return { title: 'Not found' };

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

  if (!identity) notFound();

  // 410 Gone for deleted identities — set status via route segment config
  if (identity.deletedAt) {
    // Next.js App Router: we can't set HTTP status from a page component directly.
    // Use notFound() and handle 410 via the not-found page, or use a Response.
    // Best practice: trigger a not-found that the error boundary catches as 410.
    // We signal 410 by rendering a specific message; middleware handles the status.
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

  // Fetch works
  const workList = await db
    .select()
    .from(works)
    .where(and(eq(works.createdBy, identity.id), isNull(works.deletedAt)));

  // Fetch accepted connections (both directions)
  const connectionList = await db
    .select()
    .from(connections)
    .where(
      and(
        eq(connections.status, 'accepted'),
        or(eq(connections.fromId, identity.id), eq(connections.toId, identity.id)),
      ),
    );

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

        <div className="mt-16 border-t pt-6 text-xs text-muted-foreground">
          <p>CIID: {identity.ciid}</p>
          {identity.contentHash && (
            <p className="mt-1 font-mono">
              Content hash: {identity.contentHash.slice(0, 20)}…
            </p>
          )}
          <p className="mt-2">
            <Link href={`/api/v1/identity/${identity.ciid}`} className="hover:underline">
              View JSON API
            </Link>
            {' · '}
            <Link href={`/api/v1/verify/${identity.ciid}`} className="hover:underline">
              Verify profile
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
