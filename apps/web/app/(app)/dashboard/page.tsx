import { redirect } from 'next/navigation';
import Link from 'next/link';
import { auth } from '@clerk/nextjs/server';
import { db } from '@creativeid/db';
import { identities, works } from '@creativeid/db/schema';
import { eq, and, isNull, desc } from 'drizzle-orm';
import { PlusCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ProfileCompleteness } from '@/components/ProfileCompleteness';
import { WorkCard } from '@/components/WorkCard';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const { userId } = await auth();
  if (!userId) redirect('/sign-in');

  const [identity] = await db
    .select()
    .from(identities)
    .where(and(eq(identities.clerkUserId, userId), isNull(identities.deletedAt)))
    .limit(1);

  if (!identity) redirect('/onboarding');

  const recentWorks = await db
    .select()
    .from(works)
    .where(and(eq(works.createdBy, identity.id), isNull(works.deletedAt)))
    .orderBy(desc(works.createdAt))
    .limit(5);

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">Welcome back, {identity.displayName}</h1>
          <p className="text-muted-foreground">
            {identity.handle ? (
              <>
                Your public profile:{' '}
                <Link href={`/${identity.handle}`} className="text-primary hover:underline">
                  creativeid.app/{identity.handle}
                </Link>
              </>
            ) : (
              <Link href="/profile" className="text-primary hover:underline">
                Claim your handle
              </Link>
            )}
          </p>
        </div>
        <Button asChild>
          <Link href="/profile/works/new" className="flex items-center gap-1.5">
            <PlusCircle className="h-4 w-4" /> Add a work
          </Link>
        </Button>
      </div>

      <ProfileCompleteness identity={identity} />

      <div>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Recent works</h2>
          <Link href="/profile" className="text-sm text-primary hover:underline">
            View all
          </Link>
        </div>
        {recentWorks.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center">
            <p className="text-muted-foreground">No works yet.</p>
            <Button variant="outline" size="sm" className="mt-4" asChild>
              <Link href="/profile/works/new">Add your first work</Link>
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {recentWorks.map((work) => (
              <WorkCard key={work.id} work={work} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
