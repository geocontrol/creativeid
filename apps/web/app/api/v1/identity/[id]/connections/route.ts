import { type NextRequest } from 'next/server';
import { db } from '@creativeid/db';
import { identities, connections } from '@creativeid/db/schema';
import { eq, and, isNull, or } from 'drizzle-orm';
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

  const connectionList = await db
    .select({
      id: connections.id,
      type: connections.type,
      createdAt: connections.createdAt,
      identity: {
        id: identities.id,
        ciid: identities.ciid,
        handle: identities.handle,
        displayName: identities.displayName,
        disciplines: identities.disciplines,
        connectionCount: identities.connectionCount,
      },
    })
    .from(connections)
    .innerJoin(
      identities,
      or(
        and(eq(connections.fromId, identity.id), eq(identities.id, connections.toId)),
        and(eq(connections.toId, identity.id), eq(identities.id, connections.fromId)),
      ),
    )
    .where(
      and(
        eq(connections.status, 'accepted'),
        or(eq(connections.fromId, identity.id), eq(connections.toId, identity.id)),
      ),
    );

  return apiResponse(
    { connections: connectionList },
    { ciid: identity.ciid, contentHash: identity.contentHash },
  );
}
