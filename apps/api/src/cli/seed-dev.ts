/**
 * Données de démo pour le développement local : un compte et un événement.
 * Usage : pnpm --filter @picturart/api seed:dev   (identifiants dans .env, voir .env.example)
 * Refuse de tourner en production.
 */
import { eq } from 'drizzle-orm';
import { hashPassword } from '../auth/password.ts';
import { loadConfig } from '../config.ts';
import { openDatabase } from '../db/client.ts';
import { eventMembers, events, users } from '../db/schema.ts';

const config = loadConfig();
if (config.NODE_ENV === 'production' || config.DATABASE_URL.startsWith('postgres')) {
  throw new Error('seed:dev est réservé au développement local (base pglite).');
}
const email = process.env.DEV_EMAIL;
const password = process.env.DEV_PASSWORD;
if (!email || !password) throw new Error('DEV_EMAIL et DEV_PASSWORD requis (voir .env.example)');

const { db, close } = await openDatabase(config.DATABASE_URL);
try {
  const [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (existing) {
    console.log('Compte de démo déjà présent.');
  } else {
    const [user] = await db
      .insert(users)
      .values({ displayName: 'Dylan', email, passwordHash: await hashPassword(password) })
      .returning();
    if (!user) throw new Error('création impossible');
    const [event] = await db
      .insert(events)
      .values({
        name: 'Week-end Bretagne',
        startsOn: '2026-07-12',
        endsOn: '2026-07-14',
        location: 'Quiberon',
        createdBy: user.id,
      })
      .returning();
    if (!event) throw new Error('création impossible');
    await db.insert(eventMembers).values({ eventId: event.id, userId: user.id, role: 'admin' });
    console.log('Compte et événement de démo créés.');
  }
} finally {
  await close();
}
