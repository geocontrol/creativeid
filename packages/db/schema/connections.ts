import {
  pgTable,
  uuid,
  text,
  timestamp,
  unique,
} from 'drizzle-orm/pg-core';
import { identities } from './identities';

export const connections = pgTable(
  'connections',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    fromId: uuid('from_id')
      .notNull()
      .references(() => identities.id, { onDelete: 'cascade' }),
    toId: uuid('to_id')
      .notNull()
      .references(() => identities.id, { onDelete: 'cascade' }),
    type: text('type').notNull(), // 'collaborated_with' | 'bio_photo_by' | 'managed_by' | 'mentored_by'
    note: text('note'),
    status: text('status').default('pending').notNull(), // 'pending' | 'accepted' | 'declined'
    initiatedBy: uuid('initiated_by').references(() => identities.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    uniqueFromToType: unique().on(table.fromId, table.toId, table.type),
  }),
);

export type Connection = typeof connections.$inferSelect;
export type NewConnection = typeof connections.$inferInsert;
