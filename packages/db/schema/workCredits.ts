import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
  unique,
} from 'drizzle-orm/pg-core';
import { works } from './works';
import { identities } from './identities';

export const workCredits = pgTable(
  'work_credits',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workId: uuid('work_id')
      .notNull()
      .references(() => works.id, { onDelete: 'cascade' }),
    identityId: uuid('identity_id')
      .notNull()
      .references(() => identities.id, { onDelete: 'cascade' }),
    role: text('role').notNull(), // 'composer', 'performer', 'director', 'photographer' …
    roleNote: text('role_note'), // free text detail, e.g. "lead guitar"
    creditOrder: integer('credit_order').default(0),
    attested: boolean('attested').default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    uniqueWorkIdentityRole: unique().on(table.workId, table.identityId, table.role),
  }),
);

export type WorkCredit = typeof workCredits.$inferSelect;
export type NewWorkCredit = typeof workCredits.$inferInsert;
