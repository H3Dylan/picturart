import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

export type Database = ReturnType<typeof createDatabase>;

export function createDatabase(url: string) {
  const client = postgres(url, { max: 10 });
  const db = drizzle(client);

  return {
    db,
    async ping(): Promise<boolean> {
      try {
        await db.execute(sql`select 1`);
        return true;
      } catch {
        return false;
      }
    },
    close: () => client.end({ timeout: 5 }),
  };
}
