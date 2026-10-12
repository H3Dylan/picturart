import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Config } from '../config.ts';
import type { Db } from '../db/client.ts';
import { HttpError, unauthenticated } from '../lib/errors.ts';
import { resolveSession, SESSION_COOKIE, type SessionUser } from './sessions.ts';

declare module 'fastify' {
  interface FastifyRequest {
    user: SessionUser | null;
  }
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function setSessionCookie(reply: FastifyReply, config: Config, token: string) {
  reply.setCookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: 'lax',
    path: '/',
    maxAge: config.SESSION_DAYS * 24 * 60 * 60,
  });
}

export function clearSessionCookie(reply: FastifyReply) {
  reply.clearCookie(SESSION_COOKIE, { path: '/' });
}

/** L'utilisateur connecté, ou une 401. */
export function requireUser(request: FastifyRequest): SessionUser {
  if (!request.user) throw unauthenticated();
  return request.user;
}

export function registerAuth(app: FastifyInstance, db: Db, config: Config) {
  app.decorateRequest('user', null);

  app.addHook('onRequest', async (request, reply) => {
    // Protection CSRF : en plus du cookie SameSite=Lax, une requête qui modifie
    // doit venir de la PWA elle-même.
    const origin = request.headers.origin;
    if (!SAFE_METHODS.has(request.method) && origin && origin !== config.APP_ORIGIN) {
      throw new HttpError(403, 'bad_origin', 'Origine de la requête refusée.');
    }

    const token = request.cookies[SESSION_COOKIE];
    if (!token) return;
    const session = await resolveSession(db, token, config.SESSION_DAYS);
    if (!session) {
      clearSessionCookie(reply);
      return;
    }
    request.user = session.user;
    if (session.renewed) setSessionCookie(reply, config, token);
  });
}
