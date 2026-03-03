import {
  pgTable,
  uuid,
  text,
  integer,
  jsonb,
  timestamp,
} from 'drizzle-orm/pg-core';
import { identities } from './identities';

export const works = pgTable('works', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: text('title').notNull(),
  workType: text('work_type').notNull(), // 'album' | 'film' | 'play' | 'exhibition' | 'book' | 'other'
  year: integer('year'),
  description: text('description'),
  url: text('url'), // external link (Spotify, IMDB, etc.)
  coverUrl: text('cover_url'),
  createdBy: uuid('created_by').references(() => identities.id),
  extensionData: jsonb('extension_data').default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }), // soft-delete
});

export type Work = typeof works.$inferSelect;
export type NewWork = typeof works.$inferInsert;
