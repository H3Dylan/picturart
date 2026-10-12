import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import type { ApiErrorBody, Health } from '@picturart/shared';
import Fastify from 'fastify';
import { registerAuth } from './auth/plugin.ts';
import type { Config } from './config.ts';
import type { Database } from './db/client.ts';
import { HttpError } from './lib/errors.ts';
import { authRoutes } from './modules/auth.routes.ts';
import { eventsRoutes } from './modules/events.routes.ts';
import { invitesRoutes } from './modules/invites.routes.ts';

export interface AppDeps {
  config: Config;
  database: Database;
  logger?: boolean;
}

export async function buildApp({ config, database, logger = false }: AppDeps) {
  const app = Fastify({ logger, trustProxy: true, bodyLimit: 64 * 1024 });

  await app.register(cookie);
  await app.register(rateLimit, {
    global: false,
    errorResponseBuilder: (_request, context) => ({
      statusCode: context.statusCode,
      error: { code: 'rate_limited', message: 'Trop de tentatives, réessaie dans une minute.' },
    }),
  });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof HttpError) {
      return reply.code(error.status).send(error.toBody());
    }
    const status = (error as { statusCode?: number }).statusCode ?? 500;
    if (status === 429) {
      return reply.code(429).send(error);
    }
    if (status < 500) {
      const body: ApiErrorBody = { error: { code: 'validation', message: 'Requête invalide.' } };
      return reply.code(status).send(body);
    }
    request.log.error(error);
    const body: ApiErrorBody = { error: { code: 'internal', message: 'Erreur interne.' } };
    return reply.code(500).send(body);
  });

  registerAuth(app, database.db, config);

  app.get('/api/v1/health', async (_request, reply) => {
    const databaseUp = await database.ping();
    const body: Health = {
      status: databaseUp ? 'ok' : 'degraded',
      database: databaseUp ? 'ok' : 'down',
      version: config.APP_VERSION,
    };
    return reply.code(databaseUp ? 200 : 503).send(body);
  });

  authRoutes(app, database.db, config);
  eventsRoutes(app, database.db, config);
  invitesRoutes(app, database.db, config);

  return app;
}
