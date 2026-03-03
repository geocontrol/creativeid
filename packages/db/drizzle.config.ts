import { config } from 'dotenv';
import { resolve } from 'path';
import type { Config } from 'drizzle-kit';

// Load env from repo root — drizzle-kit runs from packages/db/ so we resolve up two levels
config({ path: resolve(__dirname, '../../.env.local') });
config({ path: resolve(__dirname, '../../.env') });

export default {
  schema: './schema/index.ts',
  out: './migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env['DATABASE_URL']!,
  },
} satisfies Config;
