import { loginSchema, updateMeSchema } from '@picturart/shared';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { verifyPassword } from '../auth/password.ts';
import { clearSessionCookie, requireUser, setSessionCookie } from '../auth/plugin.ts';
import { createSession, deleteSession, SESSION_COOKIE } from '../auth/sessions.ts';
import type { Config } from '../config.ts';
import type { Db } from '../db/client.ts';
import { users } from '../db/schema.ts';
import { HttpError, parse } from '../lib/errors.ts';
import { toMe } from './serializers.ts';

export function authRoutes(app: FastifyInstance, db: Db, config: Config) {
  app.post(
    '/api/v1/auth/login',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const input = parse(loginSchema, request.body);
      const [user] = await db.select().from(users).where(eq(users.email, input.email)).limit(1);

      if (!(await verifyPassword(user?.passwordHash ?? null, input.password)) || !user) {
        throw new HttpError(401, 'invalid_credentials', 'E-mail ou mot de passe incorrect.');
      }

      const token = await createSession(
        db,
        user.id,
        config.SESSION_DAYS,
        request.headers['user-agent'],
      );
      setSessionCookie(reply, config, token);
      return toMe(user);
    },
  );

  app.post('/api/v1/auth/logout', async (request, reply) => {
    const token = request.cookies[SESSION_COOKIE];
    if (token) await deleteSession(db, token);
    clearSessionCookie(reply);
    return reply.code(204).send();
  });

  app.get('/api/v1/me', async (request) => toMe(requireUser(request)));

  app.patch('/api/v1/me', async (request) => {
    const user = requireUser(request);
    const changes = parse(updateMeSchema, request.body);
    if (Object.keys(changes).length === 0) return toMe(user);
    const { notificationPrefs, ...rest } = changes;
    const [updated] = await db
      .update(users)
      // Préférences : seules les clés envoyées changent
      .set({
        ...rest,
        ...(notificationPrefs && {
          notificationPrefs: {
            ...toMe(user).notificationPrefs,
            ...Object.fromEntries(
              Object.entries(notificationPrefs).filter(([, value]) => value !== undefined),
            ),
          },
        }),
      })
      .where(eq(users.id, user.id))
      .returning();
    return toMe(updated ?? user);
  });
}
