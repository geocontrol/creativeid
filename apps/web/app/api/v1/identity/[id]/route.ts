import { type NextRequest } from 'next/server';
import { db } from '@creativeid/db';
import { identities } from '@creativeid/db/schema';
import { eq, or, and, isNull } from 'drizzle-orm';
import { checkRateLimit } from '@/lib/rateLimit';
import { apiResponse, apiError } from '@/lib/apiResponse';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const rateLimitResult = await checkRateLimit(req);
  if (!rateLimitResult.success) return rateLimitResult.response;

  const { id } = params;
  const isCiid = id.startsWith('ciid_');

  const [identity] = await db
    .select()
    .from(identities)
    .where(
      and(
        isCiid ? eq(identities.ciid, id) : eq(identities.id, id),
        isNull(identities.deletedAt),
        eq(identities.visibility, 'public'),
      ),
    )
    .limit(1);

  if (!identity) return apiError('Identity not found', 404);

  // Strip private fields
  const { legalName: _l, clerkUserId: _c, extensionData: _e, ...publicData } = identity;

  return apiResponse(publicData, {
    ciid: identity.ciid,
    contentHash: identity.contentHash,
  });
}
