import { and, eq, gt } from 'drizzle-orm';
import type { Db } from '../db/client.ts';
import { sessions, users } from '../db/schema.ts';
import { randomToken, sha256 } from '../lib/tokens.ts';

export const SESSION_COOKIE = 'pa_session';
const DAY_MS = 24 * 60 * 60 * 1000;

export type SessionUser = typeof users.$inferSelect;

export async function createSession(db: Db, userId: string, days: number, userAgent?: string) {
  const token = randomToken(32);
  await db.insert(sessions).values({
    userId,
    tokenHash: sha256(token),
    userAgent: userAgent?.slice(0, 300),
    expiresAt: new Date(Date.now() + days * DAY_MS),
  });
  return token;
}

/**
 * Retrouve l'utilisateur d'un jeton de session valide.
 * Session glissante : prolongée au plus une fois par jour, quand l'utilisateur revient.
 */
export async function resolveSession(db: Db, token: string, days: number) {
  const tokenHash = sha256(token);
  const [row] = await db
    .select({ session: sessions, user: users })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.tokenHash, tokenHash), gt(sessions.expiresAt, new Date())))
    .limit(1);
  if (!row) return null;

  let renewed = false;
  if (Date.now() - row.session.lastSeenAt.getTime() > DAY_MS) {
    await db
      .update(sessions)
      .set({ lastSeenAt: new Date(), expiresAt: new Date(Date.now() + days * DAY_MS) })
      .where(eq(sessions.id, row.session.id));
    renewed = true;
  }
  return { user: row.user, renewed };
}

export async function deleteSession(db: Db, token: string) {
  await db.delete(sessions).where(eq(sessions.tokenHash, sha256(token)));
}
