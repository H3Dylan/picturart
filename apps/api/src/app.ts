import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import websocket from '@fastify/websocket';
import type { ApiErrorBody, Health } from '@picturart/shared';
import Fastify from 'fastify';
import { registerAuth } from './auth/plugin.ts';
import type { Config } from './config.ts';
import type { Database } from './db/client.ts';
import { HttpError } from './lib/errors.ts';
import { MediaStorage } from './media/storage.ts';
import { registerUploads } from './media/uploads.ts';
import { DONE_CHANNEL, JOBS_CHANNEL, MediaWorker } from './media/worker.ts';
import { authRoutes } from './modules/auth.routes.ts';
import { eventDetailRoutes } from './modules/event-detail.routes.ts';
import { eventsRoutes } from './modules/events.routes.ts';
import { invitesRoutes } from './modules/invites.routes.ts';
import { mediaRoutes } from './modules/media.routes.ts';
import { postsRoutes } from './modules/posts.routes.ts';
import { socialRoutes } from './modules/social.routes.ts';
import { PushDispatcher, webPushSender } from './notifications/dispatcher.ts';
import { Notifier } from './notifications/notifier.ts';
import { notificationsRoutes } from './notifications/routes.ts';
import { RealtimeHub } from './realtime/hub.ts';
import { realtimeRoutes } from './realtime/routes.ts';

declare module 'fastify' {
  interface FastifyInstance {
    /** Worker intégré (développement, tests) ; absent en production, où il tourne à part. */
    mediaWorker: MediaWorker | undefined;
    notifier: Notifier;
    realtime: RealtimeHub;
  }
}

export interface AppDeps {
  config: Config;
  database: Database;
  logger?: boolean;
}

export async function buildApp({ config, database, logger = false }: AppDeps) {
  const app = Fastify({ logger, trustProxy: true, bodyLimit: 256 * 1024 });
  const { db } = database;

  const storage = new MediaStorage(config.MEDIA_DIR);
  await storage.init();
  const hub = new RealtimeHub(db, app.log);
  app.decorate('realtime', hub);
  const worker = config.workerInline
    ? new MediaWorker({ database, storage, tools: config, log: app.log })
    : undefined;
  app.decorate('mediaWorker', worker);
  app.decorate('notifier', new Notifier(db, hub));
  // Envoi push regroupé : avec le worker (ici en développement, dans son conteneur en production)
  const dispatcher =
    config.workerInline && config.VAPID_PUBLIC_KEY && config.VAPID_PRIVATE_KEY
      ? new PushDispatcher({ db, send: webPushSender(config), log: app.log })
      : undefined;

  await app.register(cookie);
  await app.register(websocket, { options: { maxPayload: 4096 } });
  await app.register(rateLimit, {
    global: false,
    errorResponseBuilder: (_request, context) => ({
      statusCode: context.statusCode,
      error: { code: 'rate_limited', message: 'Trop de tentatives, réessaie dans une minute.' },
    }),
  });
  // Fichiers servis uniquement via reply.sendFile, après contrôle d'accès
  await app.register(fastifyStatic, { root: storage.root, serve: false });

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

  registerAuth(app, db, config);

  app.get('/api/v1/health', async (_request, reply) => {
    const databaseUp = await database.ping();
    const body: Health = {
      status: databaseUp ? 'ok' : 'degraded',
      database: databaseUp ? 'ok' : 'down',
      version: config.APP_VERSION,
    };
    return reply.code(databaseUp ? 200 : 503).send(body);
  });

  authRoutes(app, db, config);
  eventsRoutes(app, db, config);
  eventDetailRoutes(app, db);
  invitesRoutes(app, db, config);
  postsRoutes(app, db, hub);
  socialRoutes(app, db, hub);
  realtimeRoutes(app, hub, config);
  mediaRoutes(app, db);
  notificationsRoutes(app, db, config);
  registerUploads(app, db, storage, () => database.notify(JOBS_CHANNEL, ''));

  // Média traité par le worker (ici ou dans son conteneur) : prévenir les membres en direct
  let unlisten: (() => Promise<void>) | undefined;
  app.addHook('onReady', async () => {
    unlisten = await database.listen(
      DONE_CHANNEL,
      (mediaId) => void hub.publishMediaReady(mediaId),
    );
    await worker?.start();
    dispatcher?.start();
  });
  app.addHook('onClose', async () => {
    await worker?.stop();
    await dispatcher?.stop();
    await unlisten?.();
  });

  return app;
}
