import { headers } from 'next/headers';
import { Webhook } from 'svix';
import { type WebhookEvent } from '@clerk/nextjs/server';
import { db } from '@creativeid/db';
import { identities } from '@creativeid/db/schema';
import { eq, and, isNull } from 'drizzle-orm';
import { generateCiid } from '@creativeid/types';

export async function POST(req: Request) {
  const webhookSecret = process.env['CLERK_WEBHOOK_SECRET'];
  if (!webhookSecret) {
    return new Response('Webhook secret not configured', { status: 500 });
  }

  // Verify Clerk webhook signature with svix
  const headerPayload = await headers();
  const svixId = headerPayload.get('svix-id');
  const svixTimestamp = headerPayload.get('svix-timestamp');
  const svixSignature = headerPayload.get('svix-signature');

  if (!svixId || !svixTimestamp || !svixSignature) {
    return new Response('Missing svix headers', { status: 400 });
  }

  const payload = await req.json() as unknown;
  const body = JSON.stringify(payload);

  const wh = new Webhook(webhookSecret);
  let event: WebhookEvent;

  try {
    event = wh.verify(body, {
      'svix-id': svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': svixSignature,
    }) as WebhookEvent;
  } catch {
    return new Response('Invalid webhook signature', { status: 400 });
  }

  // Handle events
  if (event.type === 'user.created') {
    const { id: clerkUserId } = event.data;

    // Create identity stub — do not block response
    void db.insert(identities).values({
      ciid: generateCiid(),
      clerkUserId,
      displayName: event.data.first_name
        ? `${event.data.first_name} ${event.data.last_name ?? ''}`.trim()
        : 'New creator',
      isPrimary: true,
    });
  }

  if (event.type === 'user.deleted') {
    const { id: clerkUserId } = event.data;
    if (!clerkUserId) return new Response('OK');

    // Soft-delete all identities for this user
    void db
      .update(identities)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(identities.clerkUserId, clerkUserId), isNull(identities.deletedAt)));
  }

  return new Response('OK');
}
