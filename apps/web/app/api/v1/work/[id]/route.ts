import { type NextRequest } from 'next/server';
import { db } from '@creativeid/db';
import { works, workCredits, identities } from '@creativeid/db/schema';
import { eq, and, isNull } from 'drizzle-orm';
import { checkRateLimit } from '@/lib/rateLimit';
import { apiResponse, apiError } from '@/lib/apiResponse';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const rateLimitResult = await checkRateLimit(req);
  if (!rateLimitResult.success) return rateLimitResult.response;

  const [work] = await db
    .select()
    .from(works)
    .where(and(eq(works.id, params.id), isNull(works.deletedAt)))
    .limit(1);

  if (!work) return apiError('Work not found', 404);

  const credits = await db
    .select({
      id: workCredits.id,
      role: workCredits.role,
      roleNote: workCredits.roleNote,
      creditOrder: workCredits.creditOrder,
      attested: workCredits.attested,
      identity: {
        id: identities.id,
        ciid: identities.ciid,
        handle: identities.handle,
        displayName: identities.displayName,
        disciplines: identities.disciplines,
      },
    })
    .from(workCredits)
    .innerJoin(identities, eq(workCredits.identityId, identities.id))
    .where(eq(workCredits.workId, work.id));

  // Get creator's identity for the envelope
  const [creator] = work.createdBy
    ? await db.select({ ciid: identities.ciid, contentHash: identities.contentHash }).from(identities).where(eq(identities.id, work.createdBy)).limit(1)
    : [];

  return apiResponse(
    { ...work, credits },
    { ciid: creator?.ciid ?? '', contentHash: creator?.contentHash ?? null },
  );
}
