import { z } from 'zod';
import { DISCIPLINES } from './disciplines';
import { HANDLE_PATTERN, RESERVED_HANDLES } from './handle';

// ─── Shared primitives ────────────────────────────────────────────────────────

export const handleSchema = z
  .string()
  .min(3)
  .max(30)
  .regex(HANDLE_PATTERN, 'Invalid handle format')
  .refine((h) => !RESERVED_HANDLES.has(h), { message: 'This handle is reserved' });

export const disciplinesSchema = z.array(z.enum(DISCIPLINES)).min(1).max(5);

export const linkSchema = z.object({
  label: z.string().min(1).max(50),
  url: z.string().url(),
});

// ─── Identity schemas ─────────────────────────────────────────────────────────

export const createIdentitySchema = z.object({
  displayName: z.string().min(1).max(100),
  disciplines: disciplinesSchema.optional(),
});

export const updateIdentitySchema = z.object({
  displayName: z.string().min(1).max(100).optional(),
  legalName: z.string().max(200).optional().nullable(),
  disciplines: disciplinesSchema.optional(),
  artistStatement: z.string().max(500).optional().nullable(),
  biography: z.string().max(5000).optional().nullable(),
  avatarUrl: z.string().url().optional().nullable(),
  links: z.array(linkSchema).max(10).optional(),
  visibility: z.enum(['public', 'connections', 'private']).optional(),
});

export const setHandleSchema = z.object({
  handle: handleSchema,
});

// ─── Work schemas ─────────────────────────────────────────────────────────────

export const workTypeValues = ['album', 'film', 'play', 'exhibition', 'book', 'other'] as const;
export type WorkType = (typeof workTypeValues)[number];

export const createWorkSchema = z.object({
  title: z.string().min(1).max(200),
  workType: z.enum(workTypeValues),
  year: z.number().int().min(1800).max(new Date().getFullYear() + 5).optional().nullable(),
  description: z.string().max(2000).optional().nullable(),
  url: z.string().url().optional().nullable(),
  coverUrl: z.string().url().optional().nullable(),
  role: z.string().min(1).max(100), // creator's own role — auto-credited
  roleNote: z.string().max(200).optional().nullable(),
});

export const updateWorkSchema = z.object({
  workId: z.string().uuid(),
  title: z.string().min(1).max(200).optional(),
  workType: z.enum(workTypeValues).optional(),
  year: z.number().int().min(1800).max(new Date().getFullYear() + 5).optional().nullable(),
  description: z.string().max(2000).optional().nullable(),
  url: z.string().url().optional().nullable(),
  coverUrl: z.string().url().optional().nullable(),
});

export const addCreditSchema = z.object({
  workId: z.string().uuid(),
  identityId: z.string().uuid(),
  role: z.string().min(1).max(100),
  roleNote: z.string().max(200).optional().nullable(),
  creditOrder: z.number().int().min(0).optional(),
});

export const removeCreditSchema = z.object({
  workId: z.string().uuid(),
  creditId: z.string().uuid(),
});

// ─── Connection schemas ───────────────────────────────────────────────────────

export const connectionTypeValues = [
  'collaborated_with',
  'bio_photo_by',
  'managed_by',
  'mentored_by',
] as const;
export type ConnectionType = (typeof connectionTypeValues)[number];

export const requestConnectionSchema = z.object({
  toIdentityId: z.string().uuid(),
  type: z.enum(connectionTypeValues),
  note: z.string().max(500).optional().nullable(),
});

export const respondConnectionSchema = z.object({
  connectionId: z.string().uuid(),
});

// ─── Content report schema ────────────────────────────────────────────────────

export const reportReasonValues = [
  'offensive',
  'inaccurate',
  'impersonation',
  'spam',
  'other',
] as const;

export const createReportSchema = z.object({
  targetType: z.enum(['identity', 'work', 'work_credit']),
  targetId: z.string().uuid(),
  reason: z.enum(reportReasonValues),
  detail: z.string().max(1000).optional().nullable(),
});

// ─── Group schemas (scaffolded, not used in MVP UI) ───────────────────────────

export const groupTypeValues = [
  'band',
  'theatre_company',
  'collective',
  'production',
] as const;

export const createGroupSchema = z.object({
  name: z.string().min(1).max(100),
  handle: handleSchema.optional(),
  groupType: z.enum(groupTypeValues),
  description: z.string().max(2000).optional().nullable(),
  foundedYear: z.number().int().min(1800).max(new Date().getFullYear()).optional().nullable(),
});

export const addGroupMemberSchema = z.object({
  groupId: z.string().uuid(),
  identityId: z.string().uuid(),
  role: z.enum(['member', 'founder', 'admin']).optional(),
});
