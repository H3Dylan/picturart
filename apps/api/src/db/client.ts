import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { sql } from 'drizzle-orm';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import * as schema from './schema.ts';

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

export interface Database {
  db: Db;
  ping: () => Promise<boolean>;
  /** Écoute un canal PostgreSQL (LISTEN) ; renvoie de quoi se désabonner. */
  listen: (channel: string, onMessage: (payload: string) => void) => Promise<() => Promise<void>>;
  /** Publie sur un canal PostgreSQL (NOTIFY), entre l'API et le worker. */
  notify: (channel: string, payload: string) => Promise<void>;
  close: () => Promise<void>;
}

const migrationsFolder = fileURLToPath(new URL('./migrations', import.meta.url));

/**
 * Ouvre la base et applique les migrations.
 * - `postgres://…` : PostgreSQL (production, développement avec Docker)
 * - `pglite://memory` ou `pglite://<dossier>` : PostgreSQL embarqué (tests, développement sans Docker)
 *
 * Seule l'API applique les migrations ; le worker démarre après elle (`migrations: false`).
 */
export async function openDatabase(
  url: string,
  { migrations = true }: { migrations?: boolean } = {},
): Promise<Database> {
  if (url.startsWith('pglite://')) {
    const { PGlite } = await import('@electric-sql/pglite');
    const { drizzle } = await import('drizzle-orm/pglite');
    const { migrate } = await import('drizzle-orm/pglite/migrator');
    const target = url.slice('pglite://'.length);
    if (target !== 'memory') mkdirSync(target, { recursive: true });
    const client = new PGlite(target === 'memory' ? undefined : target);
    const db = drizzle(client, { schema });
    if (migrations) await migrate(db, { migrationsFolder });
    return wrap(db, {
      listen: async (channel, onMessage) => {
        const unsubscribe = await client.listen(channel, onMessage);
        return () => unsubscribe();
      },
      close: () => client.close(),
    });
  }

  const { default: postgres } = await import('postgres');
  const { drizzle } = await import('drizzle-orm/postgres-js');
  const { migrate } = await import('drizzle-orm/postgres-js/migrator');
  const client = postgres(url, { max: 10, onnotice: () => {} });
  const db = drizzle(client, { schema });
  if (migrations) await migrate(db, { migrationsFolder });
  return wrap(db, {
    listen: async (channel, onMessage) => {
      const { unlisten } = await client.listen(channel, onMessage);
      return unlisten;
    },
    close: () => client.end({ timeout: 5 }),
  });
}

function wrap(db: Db, driver: Pick<Database, 'listen' | 'close'>): Database {
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
    listen: driver.listen,
    async notify(channel, payload) {
      await db.execute(sql`select pg_notify(${channel}, ${payload})`);
    },
    close: driver.close,
  };
}
