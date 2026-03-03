import {
  pgTable,
  uuid,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';
import { identities } from './identities';

export const contentReports = pgTable('content_reports', {
  id: uuid('id').primaryKey().defaultRandom(),
  reporterId: uuid('reporter_id').references(() => identities.id), // NULL if anonymous
  targetType: text('target_type').notNull(), // 'identity' | 'work' | 'work_credit'
  targetId: uuid('target_id').notNull(),
  reason: text('reason').notNull(), // 'offensive' | 'inaccurate' | 'impersonation' | 'spam' | 'other'
  detail: text('detail'), // free text from reporter
  status: text('status').default('open').notNull(), // 'open' | 'reviewed' | 'actioned' | 'dismissed'
  reviewedBy: text('reviewed_by'), // admin identifier
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export type ContentReport = typeof contentReports.$inferSelect;
export type NewContentReport = typeof contentReports.$inferInsert;
