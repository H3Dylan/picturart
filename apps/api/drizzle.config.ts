import { defineConfig } from 'drizzle-kit';

// Génère les migrations SQL à partir du schéma : pnpm --filter @picturart/api db:generate
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
});
