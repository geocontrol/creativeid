import { notFound } from 'next/navigation';
import { type Metadata } from 'next';
import Link from 'next/link';
import { db } from '@creativeid/db';
import { works, workCredits, identities } from '@creativeid/db/schema';
import { eq, and, isNull } from 'drizzle-orm';
import { Badge } from '@/components/ui/badge';
import { IdentityCard } from '@/components/IdentityCard';
import { type WorkType } from '@creativeid/types';

interface Props {
  params: { id: string };
}

const workTypeLabels: Record<WorkType, string> = {
  album: 'Album',
  film: 'Film',
  play: 'Play',
  exhibition: 'Exhibition',
  book: 'Book',
  other: 'Other',
};

async function getWork(id: string) {
  const [work] = await db
    .select()
    .from(works)
    .where(and(eq(works.id, id), isNull(works.deletedAt)))
    .limit(1);
  return work ?? null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const work = await getWork(params.id);
  if (!work) return { title: 'Work not found' };
  return {
    title: work.title,
    description: work.description ?? undefined,
  };
}

export default async function WorkDetailPage({ params }: Props) {
  const work = await getWork(params.id);
  if (!work) notFound();

  const credits = await db
    .select({
      id: workCredits.id,
      role: workCredits.role,
      roleNote: workCredits.roleNote,
      creditOrder: workCredits.creditOrder,
      identity: {
        id: identities.id,
        ciid: identities.ciid,
        handle: identities.handle,
        displayName: identities.displayName,
        avatarUrl: identities.avatarUrl,
        disciplines: identities.disciplines,
        connectionCount: identities.connectionCount,
      },
    })
    .from(workCredits)
    .innerJoin(identities, eq(workCredits.identityId, identities.id))
    .where(and(eq(workCredits.workId, work.id), isNull(identities.deletedAt)))
    .orderBy(workCredits.creditOrder);

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
        <div className="flex flex-wrap items-center gap-3">
          <Badge variant="secondary">
            {workTypeLabels[work.workType as WorkType] ?? work.workType}
          </Badge>
          {work.year && (
            <span className="text-sm text-muted-foreground">{work.year}</span>
          )}
        </div>

        <h1 className="mt-3 text-3xl font-bold tracking-tight">{work.title}</h1>

        {work.description && (
          <p className="mt-4 whitespace-pre-line text-muted-foreground">{work.description}</p>
        )}

        {work.url && (
          <a
            href={work.url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-flex items-center gap-1 text-sm text-primary hover:underline"
          >
            View externally →
          </a>
        )}

        {credits.length > 0 && (
          <section className="mt-10">
            <h2 className="mb-4 text-lg font-semibold">Credits</h2>
            <div className="space-y-3">
              {credits.map((credit) => (
                <div key={credit.id} className="flex items-start gap-4">
                  <div className="w-40 shrink-0 pt-1 text-sm text-muted-foreground">
                    {credit.role}
                    {credit.roleNote && (
                      <span className="block text-xs">{credit.roleNote}</span>
                    )}
                  </div>
                  <div className="flex-1">
                    <IdentityCard identity={credit.identity} />
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        <div className="mt-16 border-t pt-6 text-xs text-muted-foreground">
          <p>Work ID: {work.id}</p>
          <p className="mt-2">
            <Link href={`/api/v1/work/${work.id}`} className="hover:underline">
              View JSON API
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
