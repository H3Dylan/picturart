import {
  markReadSchema,
  type NotificationsPage,
  pushSubscriptionSchema,
  unsubscribePushSchema,
} from '@picturart/shared';
import { and, eq, inArray, isNull, lt, or } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { requireUser } from '../auth/plugin.ts';
import type { Config } from '../config.ts';
import type { Db } from '../db/client.ts';
import { notifications, pushSubscriptions } from '../db/schema.ts';
import { decodeCursor, encodeCursor } from '../lib/cursor.ts';
import { notFound, parse } from '../lib/errors.ts';
import { loadNotifications, unreadCount } from './load.ts';
import { memoriesFor } from './memories.ts';

const PAGE_SIZE = 30;

export function notificationsRoutes(app: FastifyInstance, db: Db, config: Config) {
  /** Écran Activité : du plus récent au plus ancien, avec le nombre de non lues. */
  app.get<{ Querystring: { cursor?: string } }>('/api/v1/notifications', async (request) => {
    const user = requireUser(request);
    const cursor = request.query.cursor ? decodeCursor(request.query.cursor) : null;
    const page = await loadNotifications(
      db,
      and(
        eq(notifications.userId, user.id),
        cursor
          ? or(
              lt(notifications.createdAt, cursor.date),
              and(eq(notifications.createdAt, cursor.date), lt(notifications.id, cursor.id)),
            )
          : undefined,
      ),
      PAGE_SIZE + 1,
    );
    const items = page.slice(0, PAGE_SIZE);
    const last = items.at(-1)?.row;
    const body: NotificationsPage = {
      items: items.map((n) => n.dto),
      nextCursor: page.length > PAGE_SIZE && last ? encodeCursor(last.createdAt, last.id) : null,
      unread: await unreadCount(db, user.id),
    };
    return body;
  });

  app.get('/api/v1/notifications/unread', async (request) => ({
    unread: await unreadCount(db, requireUser(request).id),
  }));

  /** Marquer comme lues certaines notifications, ou toutes. */
  app.post('/api/v1/notifications/read', async (request) => {
    const user = requireUser(request);
    const { ids } = parse(markReadSchema, request.body ?? {});
    if (ids?.length === 0) return { unread: await unreadCount(db, user.id) };
    await db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(
        and(
          eq(notifications.userId, user.id),
          isNull(notifications.readAt),
          ids ? inArray(notifications.id, ids) : undefined,
        ),
      );
    return { unread: await unreadCount(db, user.id) };
  });

  /** Souvenirs du jour : « il y a 1 an », en tête du fil. */
  app.get('/api/v1/memories', async (request) => memoriesFor(db, requireUser(request).id));

  // ---- Web Push ----------------------------------------------------------------------
  /** Clé publique VAPID : la PWA en a besoin pour s'abonner. 404 si le push n'est pas configuré. */
  app.get('/api/v1/push/key', async (request) => {
    requireUser(request);
    if (!config.VAPID_PUBLIC_KEY) throw notFound('Push');
    return { publicKey: config.VAPID_PUBLIC_KEY };
  });

  /** Abonnement de cet appareil. Un même appareil repris par un autre compte change de propriétaire. */
  app.post('/api/v1/push/subscriptions', async (request, reply) => {
    const user = requireUser(request);
    const { endpoint, keys } = parse(pushSubscriptionSchema, request.body);
    const userAgent = request.headers['user-agent']?.slice(0, 300) ?? null;
    await db
      .insert(pushSubscriptions)
      .values({ userId: user.id, endpoint, p256dh: keys.p256dh, auth: keys.auth, userAgent })
      .onConflictDoUpdate({
        target: pushSubscriptions.endpoint,
        set: { userId: user.id, p256dh: keys.p256dh, auth: keys.auth, userAgent },
      });
    return reply.code(201).send({ subscribed: true });
  });

  app.delete('/api/v1/push/subscriptions', async (request, reply) => {
    const user = requireUser(request);
    const { endpoint } = parse(unsubscribePushSchema, request.body);
    await db
      .delete(pushSubscriptions)
      .where(and(eq(pushSubscriptions.userId, user.id), eq(pushSubscriptions.endpoint, endpoint)));
    return reply.code(204).send();
  });
}
