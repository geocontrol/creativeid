import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { db } from '@creativeid/db';
import { identities, works } from '@creativeid/db/schema';
import { eq, and, isNull } from 'drizzle-orm';
import { generatePhotoUploadUrl } from '@/lib/r2';
import { getUploadUrlSchema } from '@creativeid/types';

const PHOTO_LIMIT = 20;

export async function POST(req: NextRequest): Promise<NextResponse> {
  const { userId } = auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = getUploadUrlSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? 'Invalid input' },
      { status: 400 },
    );
  }

  // fileSize is validated by the Zod schema above (max 10 MB). R2 does not enforce
  // size server-side via presigned URL at MVP. Destructure without using fileSize
  // to avoid a TypeScript "unused variable" error in strict mode.
  const { filename, contentType } = parsed.data;

  // Resolve the caller's identity.
  const [identity] = await db
    .select({ id: identities.id })
    .from(identities)
    .where(and(eq(identities.clerkUserId, userId), isNull(identities.deletedAt)))
    .limit(1);

  if (!identity) {
    return NextResponse.json({ error: 'Identity not found' }, { status: 404 });
  }

  // Optimistic photo limit check.
  const photoCountResult = await db
    .select({ id: works.id })
    .from(works)
    .where(
      and(
        eq(works.subjectIdentityId, identity.id),
        eq(works.workType, 'photograph'),
        isNull(works.deletedAt),
      ),
    );

  if (photoCountResult.length >= PHOTO_LIMIT) {
    return NextResponse.json(
      { error: `Photo limit reached (${PHOTO_LIMIT})` },
      { status: 400 },
    );
  }

  const result = await generatePhotoUploadUrl(identity.id, filename, contentType);
  return NextResponse.json(result);
}
