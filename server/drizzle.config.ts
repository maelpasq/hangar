import { defineConfig } from 'drizzle-kit';

// `npm run db:generate` écrit les migrations SQL dans drizzle/ (commitées).
// `npm run db:migrate` les applique à la base désignée par TURSO_URL et TURSO_TOKEN.
export default defineConfig({
  dialect: 'turso',
  schema: './src/schema.ts',
  out: './drizzle',
  dbCredentials: {
    url: process.env.TURSO_URL ?? 'file:local.db',
    authToken: process.env.TURSO_TOKEN
  }
});
