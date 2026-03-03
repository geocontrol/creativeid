import {
  pgTable,
  uuid,
  text,
  boolean,
  integer,
  jsonb,
  timestamp,
} from 'drizzle-orm/pg-core';

export const identities = pgTable('identities', {
  id: uuid('id').primaryKey().defaultRandom(),
  ciid: text('ciid').unique().notNull(),
  // NOT unique at DB level — preserves multi-identity schema compatibility.
  // Enforce ONE identity per clerk_user_id in application logic at MVP.
  clerkUserId: text('clerk_user_id').notNull(),
  isPrimary: boolean('is_primary').default(true),
  handle: text('handle').unique(),
  displayName: text('display_name').notNull(),
  legalName: text('legal_name'), // never exposed publicly
  disciplines: text('disciplines').array(),
  artistStatement: text('artist_statement'),
  biography: text('biography'),
  avatarUrl: text('avatar_url'),
  links: jsonb('links').$type<Array<{ label: string; url: string }>>().default([]),
  visibility: text('visibility').default('public'), // 'public' | 'connections' | 'private'
  contentHash: text('content_hash'), // SHA-256 of canonical JSON at publish
  connectionCount: integer('connection_count').default(0), // denormalised; for web-of-trust
  isVerified: boolean('is_verified').default(false),
  extensionData: jsonb('extension_data').default({}), // sector-specific fields (Phase 2)
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }), // soft-delete
});

export type Identity = typeof identities.$inferSelect;
export type NewIdentity = typeof identities.$inferInsert;
