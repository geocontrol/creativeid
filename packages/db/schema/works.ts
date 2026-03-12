import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  jsonb,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';
import { identities } from './identities';

export const works = pgTable(
  'works',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    title: text('title').notNull(),
    workType: text('work_type').notNull(),
    // 'album' | 'film' | 'play' | 'exhibition' | 'book' | 'other' | 'photograph'
    year: integer('year'),
    description: text('description'),
    url: text('url'),
    coverUrl: text('cover_url'),
    createdBy: uuid('created_by').references(() => identities.id),
    // photograph-specific columns (NULL for all other work types)
    subjectIdentityId: uuid('subject_identity_id').references(() => identities.id),
    displayOrder: integer('display_order').default(0),
    isAvatar: boolean('is_avatar').default(false),
    extensionData: jsonb('extension_data').default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => ({
    subjectIdentityIdx: index('works_subject_identity_idx').on(table.subjectIdentityId),
  }),
);

export type Work = typeof works.$inferSelect;
export type NewWork = typeof works.$inferInsert;
