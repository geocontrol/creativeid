import { createHash } from 'crypto';

export interface PublicIdentityPayload {
  ciid: string;
  display_name: string;
  disciplines: string[] | null | undefined;
  artist_statement: string | null | undefined;
  biography: string | null | undefined;
}

/**
 * Generate a SHA-256 content hash for a published identity profile.
 * The hash is deterministic: key order is fixed, no whitespace.
 * Phase 3 will upgrade to Ed25519 keypair signing.
 */
export function generateContentHash(identity: PublicIdentityPayload): string {
  const canonical = JSON.stringify(
    {
      ciid: identity.ciid,
      display_name: identity.display_name,
      disciplines: identity.disciplines ?? [],
      artist_statement: identity.artist_statement ?? null,
      biography: identity.biography ?? null,
      published_at: new Date().toISOString(),
    },
    null,
    0, // no whitespace — deterministic
  );

  return 'sha256:' + createHash('sha256').update(canonical, 'utf8').digest('hex');
}

/**
 * Recompute hash from stored data for verification.
 * Returns the stored hash alongside the freshly computed one.
 */
export function verifyContentHash(
  identity: PublicIdentityPayload,
  storedHash: string,
): { stored: string; computed: string; matches: boolean } {
  const computed = generateContentHash(identity);
  return { stored: storedHash, computed, matches: storedHash === computed };
}
