import { customAlphabet } from 'nanoid';

const nanoid = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', 12);

/**
 * Generate a creativeId identifier.
 * Format: ciid_ + 12 lowercase alphanumeric characters.
 * Generated once at identity creation — immutable thereafter.
 */
export function generateCiid(): string {
  return `ciid_${nanoid()}`;
}

export const CIID_PATTERN = /^ciid_[a-z0-9]{12}$/;
