import {
  DEFAULT_NOTIFICATION_PREFS,
  type NotificationDto,
  PREF_OF_TYPE,
  summarizeForPush,
} from '@picturart/shared';
import { and, eq, gt, isNull, max, sql } from 'drizzle-orm';
import webPush from 'web-push';
import type { Config } from '../config.ts';
import type { Db } from '../db/client.ts';
import { eventMembers, notifications, pushSubscriptions, users } from '../db/schema.ts';
import type { Log } from '../media/processor.ts';
import { loadNotifications, unreadCount } from './load.ts';

/** Envois de photos : on attend 2 minutes de calme pour tout regrouper en une notification. */
export const POST_CALM_MS = 2 * 60_000;
/** Réactions et commentaires : courte attente, pour regrouper une rafale. */
export const OTHER_CALM_MS = 30_000;
/** Activité ininterrompue : on envoie quand même au bout de 10 minutes. */
const MAX_WAIT_MS = 10 * 60_000;
/** Au-delà d'un jour, une notification n'est plus poussée (worker arrêté longtemps). */
const STALE_MS = 24 * 60 * 60_000;

export interface PushTarget {
  endpoint: string;
  p256dh: string;
  auth: string;
}

/** Envoi vers le service de push du navigateur ; `gone` : abonnement expiré, à oublier. */
export type PushSender = (target: PushTarget, payload: string) => Promise<'ok' | 'gone'>;

export function webPushSender(config: Config): PushSender {
  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = config;
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) throw new Error('clés VAPID manquantes');
  const vapidDetails = {
    subject: VAPID_SUBJECT,
    publicKey: VAPID_PUBLIC_KEY,
    privateKey: VAPID_PRIVATE_KEY,
  };
  return async (target, payload) => {
    try {
      await webPush.sendNotification(
        { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } },
        payload,
        { vapidDetails, TTL: 24 * 3600, urgency: 'normal' },
      );
      return 'ok';
    } catch (error) {
      const status = (error as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) return 'gone';
      throw error;
    }
  };
}

interface DispatcherDeps {
  db: Db;
  send: PushSender;
  log: Log;
  now?: () => Date;
}

/**
 * Regroupe les notifications pas encore poussées, par destinataire, et envoie une seule
 * notification push par salve sur chacun de ses appareils. Respecte les préférences
 * (« Me prévenir quand… ») et les événements coupés. Au plus une fois : les lignes sont
 * marquées avant l'envoi, un plantage ne renvoie pas deux fois la même chose.
 */
export class PushDispatcher {
  readonly #deps: DispatcherDeps;
  #timer: NodeJS.Timeout | undefined;
  #running: Promise<void> | null = null;

  constructor(deps: DispatcherDeps) {
    this.#deps = deps;
  }

  start(intervalMs = 10_000) {
    this.#timer = setInterval(() => void this.run(), intervalMs);
  }

  async stop() {
    clearInterval(this.#timer);
    await this.#running;
  }

  /** Un passage : envoie les salves arrivées au calme. Les appels concurrents sont regroupés. */
  run(): Promise<void> {
    this.#running ??= this.#run()
      .catch((error) => this.#deps.log.error({ err: error }, 'envoi des notifications push'))
      .finally(() => {
        this.#running = null;
      });
    return this.#running;
  }

  async #run() {
    const { db } = this.#deps;
    const now = (this.#deps.now ?? (() => new Date()))();
    const fresh = new Date(now.getTime() - STALE_MS);
    const pending = await db
      .select({
        userId: notifications.userId,
        latest: max(notifications.createdAt),
        oldest: sql<Date>`min(${notifications.createdAt})`.mapWith(notifications.createdAt),
        hasPost: sql<boolean>`bool_or(${notifications.type} = 'post')`,
      })
      .from(notifications)
      .where(and(isNull(notifications.pushedAt), gt(notifications.createdAt, fresh)))
      .groupBy(notifications.userId);

    for (const { userId, latest, oldest, hasPost } of pending) {
      if (!latest) continue;
      const calm = hasPost ? POST_CALM_MS : OTHER_CALM_MS;
      const quiet = now.getTime() - latest.getTime() >= calm;
      const tooLong = now.getTime() - oldest.getTime() >= MAX_WAIT_MS;
      if (quiet || tooLong) await this.#flush(userId, now, fresh);
    }

    // Les notifications trop anciennes ne partiront plus
    await db
      .update(notifications)
      .set({ pushedAt: now })
      .where(and(isNull(notifications.pushedAt), sql`${notifications.createdAt} <= ${fresh}`));
  }

  async #flush(userId: string, now: Date, fresh: Date) {
    const { db, send, log } = this.#deps;
    const batch = await loadNotifications(
      db,
      and(
        eq(notifications.userId, userId),
        isNull(notifications.pushedAt),
        gt(notifications.createdAt, fresh),
      ),
      200,
    );
    await db
      .update(notifications)
      .set({ pushedAt: now })
      .where(and(eq(notifications.userId, userId), isNull(notifications.pushedAt)));

    const [user] = await db
      .select({ prefs: users.notificationPrefs })
      .from(users)
      .where(eq(users.id, userId));
    const prefs = { ...DEFAULT_NOTIFICATION_PREFS, ...user?.prefs };
    const mutedRows = await db
      .select({ eventId: eventMembers.eventId })
      .from(eventMembers)
      .where(and(eq(eventMembers.userId, userId), eq(eventMembers.muted, true)));
    const muted = new Set(mutedRows.map((m) => m.eventId));

    const wanted: NotificationDto[] = batch
      .map((n) => n.dto)
      .filter((n) => {
        const pref = PREF_OF_TYPE[n.type];
        return pref !== null && prefs[pref] && !muted.has(n.event.id);
      })
      .reverse();
    const payload = summarizeForPush(wanted, await unreadCount(db, userId));
    if (!payload) return;

    const targets = await db
      .select()
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.userId, userId));
    for (const target of targets) {
      try {
        const result = await send(target, JSON.stringify(payload));
        if (result === 'gone') {
          await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, target.id));
        } else {
          await db
            .update(pushSubscriptions)
            .set({ lastSuccessAt: now })
            .where(eq(pushSubscriptions.id, target.id));
        }
      } catch (error) {
        log.warn({ err: error, userId }, 'notification push refusée');
      }
    }
  }
}
