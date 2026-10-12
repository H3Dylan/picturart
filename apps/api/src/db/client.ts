import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { sql } from 'drizzle-orm';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import * as schema from './schema.ts';

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

export interface Database {
  db: Db;
  ping: () => Promise<boolean>;
  close: () => Promise<void>;
}

const migrationsFolder = fileURLToPath(new URL('./migrations', import.meta.url));

/**
 * Ouvre la base et applique les migrations.
 * - `postgres://…` : PostgreSQL (production, développement avec Docker)
 * - `pglite://memory` ou `pglite://<dossier>` : PostgreSQL embarqué (tests, développement sans Docker)
 */
export async function openDatabase(url: string): Promise<Database> {
  if (url.startsWith('pglite://')) {
    const { PGlite } = await import('@electric-sql/pglite');
    const { drizzle } = await import('drizzle-orm/pglite');
    const { migrate } = await import('drizzle-orm/pglite/migrator');
    const target = url.slice('pglite://'.length);
    if (target !== 'memory') mkdirSync(target, { recursive: true });
    const client = new PGlite(target === 'memory' ? undefined : target);
    const db = drizzle(client, { schema });
    await migrate(db, { migrationsFolder });
    return wrap(db, () => client.close());
  }

  const { default: postgres } = await import('postgres');
  const { drizzle } = await import('drizzle-orm/postgres-js');
  const { migrate } = await import('drizzle-orm/postgres-js/migrator');
  const client = postgres(url, { max: 10, onnotice: () => {} });
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder });
  return wrap(db, () => client.end({ timeout: 5 }));
}

function wrap(db: Db, close: () => Promise<void>): Database {
  return {
    db,
    async ping() {
      try {
        await db.execute(sql`select 1`);
        return true;
      } catch {
        return false;
      }
    },
    close,
  };
}
