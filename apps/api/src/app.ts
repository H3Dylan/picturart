import type { Health } from '@picturart/shared';
import Fastify from 'fastify';

export interface AppDeps {
  version: string;
  /** Vérifie que la base répond ; injecté pour pouvoir tester sans PostgreSQL. */
  pingDatabase: () => Promise<boolean>;
  logger?: boolean;
}

export function buildApp({ version, pingDatabase, logger = false }: AppDeps) {
  const app = Fastify({ logger, trustProxy: true });

  app.get('/api/v1/health', async (_request, reply) => {
    const databaseUp = await pingDatabase();
    const body: Health = {
      status: databaseUp ? 'ok' : 'degraded',
      database: databaseUp ? 'ok' : 'down',
      version,
    };
    return reply.code(databaseUp ? 200 : 503).send(body);
  });

  return app;
}
