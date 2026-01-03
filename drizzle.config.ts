import { defineConfig } from 'drizzle-kit';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL, ensure the database is provisioned');
}

export default defineConfig({
  out: './migrations',
  schema: [
    './shared/schema.ts',
    './shared/schema-lp-reporting.ts',
    './shared/schema-lp-sprint3.ts', // Sprint 3: Capital calls, distributions, documents, notifications
  ],
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});
