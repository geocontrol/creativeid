/**
 * Handle validation rules as per CLAUDE.md:
 * - 3–30 characters
 * - Lowercase alphanumeric + hyphens only
 * - Cannot start or end with a hyphen
 * - Reserved words blocked
 */

export const RESERVED_HANDLES = new Set([
  'api',
  'admin',
  'dashboard',
  'settings',
  'onboarding',
  'sign-in',
  'sign-up',
  'help',
  'about',
  'pricing',
  'blog',
  'legal',
]);

export const HANDLE_PATTERN = /^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$|^[a-z0-9]{3}$/;

export function validateHandle(handle: string): { valid: true } | { valid: false; reason: string } {
  if (handle.length < 3 || handle.length > 30) {
    return { valid: false, reason: 'Handle must be between 3 and 30 characters.' };
  }
  if (!HANDLE_PATTERN.test(handle)) {
    return {
      valid: false,
      reason:
        'Handle may only contain lowercase letters, numbers, and hyphens, and cannot start or end with a hyphen.',
    };
  }
  if (RESERVED_HANDLES.has(handle)) {
    return { valid: false, reason: `"${handle}" is a reserved word and cannot be used as a handle.` };
  }
  return { valid: true };
}
