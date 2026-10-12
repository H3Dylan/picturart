import type { LightMyRequestResponse } from 'fastify';
import { buildApp } from '../src/app.ts';
import { hashPassword } from '../src/auth/password.ts';
import { loadConfig } from '../src/config.ts';
import { openDatabase } from '../src/db/client.ts';
import { users } from '../src/db/schema.ts';

export const ORIGIN = 'https://pictur.test';

/** Application complète sur un PostgreSQL embarqué en mémoire (PGlite), migrations appliquées. */
export async function createTestApp() {
  const config = loadConfig({ DATABASE_URL: 'pglite://memory', APP_ORIGIN: ORIGIN });
  const database = await openDatabase(config.DATABASE_URL);
  const app = await buildApp({ config, database });

  async function createUser(displayName: string, email: string, password = 'motdepasse') {
    const [user] = await database.db
      .insert(users)
      .values({ displayName, email, passwordHash: await hashPassword(password) })
      .returning();
    if (!user) throw new Error('utilisateur non créé');
    return user;
  }

  /** Se connecte et renvoie l'en-tête Cookie à réutiliser. */
  async function login(email: string, password = 'motdepasse') {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { origin: ORIGIN },
      payload: { email, password },
    });
    if (response.statusCode !== 200) throw new Error(`login ${response.statusCode}`);
    return sessionCookie(response);
  }

  async function close() {
    await app.close();
    await database.close();
  }

  return { app, database, createUser, login, close };
}

export function sessionCookie(response: LightMyRequestResponse) {
  const cookie = response.cookies.find((c) => c.name === 'pa_session');
  if (!cookie) throw new Error('pas de cookie de session');
  return `pa_session=${cookie.value}`;
}
