import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { LightMyRequestResponse } from 'fastify';
import { buildApp } from '../src/app.ts';
import { hashPassword } from '../src/auth/password.ts';
import { loadConfig } from '../src/config.ts';
import { openDatabase } from '../src/db/client.ts';
import { users } from '../src/db/schema.ts';

export const ORIGIN = 'https://pictur.test';

/** Application complète sur un PostgreSQL embarqué en mémoire (PGlite), migrations appliquées. */
export async function createTestApp() {
  const mediaDir = await mkdtemp(join(tmpdir(), 'picturart-test-'));
  const config = loadConfig({
    DATABASE_URL: 'pglite://memory',
    APP_ORIGIN: ORIGIN,
    MEDIA_DIR: mediaDir,
    // Transcodage logiciel : résultat identique avec ou sans iGPU
    VIDEO_HWACCEL: (process.env.VIDEO_HWACCEL as 'none' | 'vaapi' | undefined) ?? 'none',
    HEIF_DEC_PATH: process.env.HEIF_DEC_PATH,
  });
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
    await rm(mediaDir, { recursive: true, force: true });
  }

  return { app, database, createUser, login, close };
}

export function sessionCookie(response: LightMyRequestResponse) {
  const cookie = response.cookies.find((c) => c.name === 'pa_session');
  if (!cookie) throw new Error('pas de cookie de session');
  return `pa_session=${cookie.value}`;
}

/**
 * Envoi tus complet (création + un seul PATCH). Passe par un vrai serveur HTTP (`app.listen`) :
 * le serveur tus lit le flux réseau brut, que l'injection de requêtes de Fastify ne simule pas.
 */
export async function tusUpload(
  base: string,
  cookie: string,
  mediaId: string,
  body: Uint8Array,
  filename = 'photo.jpg',
) {
  const b64 = (value: string) => Buffer.from(value).toString('base64');
  const headers = { cookie, origin: ORIGIN, 'tus-resumable': '1.0.0' };
  const created = await fetch(`${base}/api/v1/uploads`, {
    method: 'POST',
    headers: {
      ...headers,
      'upload-length': String(body.length),
      'upload-metadata': `mediaId ${b64(mediaId)},filename ${b64(filename)}`,
    },
  });
  if (created.status !== 201) return { statusCode: created.status };
  const location = new URL(created.headers.get('location') ?? '', base).pathname;
  const patched = await fetch(`${base}${location}`, {
    method: 'PATCH',
    headers: {
      ...headers,
      'upload-offset': '0',
      'content-type': 'application/offset+octet-stream',
    },
    body: new Uint8Array(body),
  });
  return { statusCode: patched.status };
}
