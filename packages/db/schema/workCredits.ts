import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { isNotNull } from 'drizzle-orm';
import { works } from './works';
import { identities } from './identities';

export const workCredits = pgTable(
  'work_credits',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workId: uuid('work_id')
      .notNull()
      .references(() => works.id, { onDelete: 'cascade' }),
    // Nullable: photographer may not be a creativeId holder.
    // ON DELETE SET NULL: if photographer's identity is deleted, credit row is kept.
    identityId: uuid('identity_id').references(() => identities.id, {
      onDelete: 'set null',
    }),
    role: text('role').notNull(),
    roleNote: text('role_note'),
    creditOrder: integer('credit_order').default(0),
    attested: boolean('attested').default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    // Partial unique index: only enforce uniqueness when identity_id is not null.
    // NULL identity_id (off-platform photographer) is deduplicated in app logic.
    uniqueWorkIdentityRole: uniqueIndex('work_credits_unique_identity')
      .on(table.workId, table.identityId, table.role)
      .where(isNotNull(table.identityId)),
  }),
);

export type WorkCredit = typeof workCredits.$inferSelect;
export type NewWorkCredit = typeof workCredits.$inferInsert;
