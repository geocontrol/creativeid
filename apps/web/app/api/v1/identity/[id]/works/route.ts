import { type NextRequest } from 'next/server';
import { db } from '@creativeid/db';
import { identities, works, workCredits } from '@creativeid/db/schema';
import { eq, and, isNull } from 'drizzle-orm';
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
    .select({ id: identities.id, ciid: identities.ciid, contentHash: identities.contentHash, visibility: identities.visibility })
    .from(identities)
    .where(
      and(
        isCiid ? eq(identities.ciid, id) : eq(identities.id, id),
        isNull(identities.deletedAt),
      ),
    )
    .limit(1);

  if (!identity) return apiError('Identity not found', 404);
  if (identity.visibility !== 'public') return apiError('Identity not found', 404);

  // Pagination
  const url = new URL(req.url);
  const page = Math.max(1, Number(url.searchParams.get('page') ?? '1'));
  const limit = Math.min(50, Number(url.searchParams.get('limit') ?? '20'));
  const offset = (page - 1) * limit;

  const workList = await db
    .select()
    .from(works)
    .where(and(eq(works.createdBy, identity.id), isNull(works.deletedAt)))
    .limit(limit)
    .offset(offset);

  return apiResponse(
    { works: workList, page, limit },
    { ciid: identity.ciid, contentHash: identity.contentHash },
  );
}
