import { type NextRequest } from 'next/server';
import { db } from '@creativeid/db';
import { identities } from '@creativeid/db/schema';
import { eq, and, isNull } from 'drizzle-orm';
import { generateContentHash } from '@creativeid/types';
import { checkRateLimit } from '@/lib/rateLimit';
import { apiError } from '@/lib/apiResponse';

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
      ),
    )
    .limit(1);

  if (!identity) return apiError('Identity not found', 404);

  if (!identity.contentHash) {
    return apiError('This profile has not been published yet — no content hash exists.', 422);
  }

  const computed = generateContentHash({
    ciid: identity.ciid,
    display_name: identity.displayName,
    disciplines: identity.disciplines,
    artist_statement: identity.artistStatement,
    biography: identity.biography,
  });

  const matches = identity.contentHash === computed;

  const body = {
    data: {
      ciid: identity.ciid,
      stored_hash: identity.contentHash,
      computed_hash: computed,
      matches,
      note: matches
        ? 'Profile content matches the stored hash — no drift detected.'
        : 'Profile content does not match the stored hash — the profile may have been modified after publishing.',
    },
    meta: {
      ciid: identity.ciid,
      content_hash: identity.contentHash,
      generated_at: new Date().toISOString(),
    },
  };

  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
  });
}
