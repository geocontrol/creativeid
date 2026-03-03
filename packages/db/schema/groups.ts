import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
} from 'drizzle-orm/pg-core';
import { identities } from './identities';

// Groups are scaffolded at DB level but not surfaced in UI at MVP.
// See CLAUDE.md: "What NOT to Build at MVP"

export const groups = pgTable('groups', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  handle: text('handle').unique(),
  groupType: text('group_type').notNull(), // 'band' | 'theatre_company' | 'collective' | 'production'
  description: text('description'),
  avatarUrl: text('avatar_url'),
  foundedYear: integer('founded_year'),
  disbandedYear: integer('disbanded_year'), // NULL = active
  createdBy: uuid('created_by').references(() => identities.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});

export const groupMemberships = pgTable('group_memberships', {
  id: uuid('id').primaryKey().defaultRandom(),
  groupId: uuid('group_id')
    .notNull()
    .references(() => groups.id, { onDelete: 'cascade' }),
  identityId: uuid('identity_id')
    .notNull()
    .references(() => identities.id, { onDelete: 'cascade' }),
  role: text('role'), // 'member' | 'founder' | 'admin'
  joinedAt: timestamp('joined_at', { withTimezone: true }),
  leftAt: timestamp('left_at', { withTimezone: true }), // NULL = current member
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export type Group = typeof groups.$inferSelect;
export type NewGroup = typeof groups.$inferInsert;
export type GroupMembership = typeof groupMemberships.$inferSelect;
export type NewGroupMembership = typeof groupMemberships.$inferInsert;
