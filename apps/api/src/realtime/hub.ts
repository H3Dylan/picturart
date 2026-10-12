import type { RealtimeMessage } from '@picturart/shared';
import { eq } from 'drizzle-orm';
import type { FastifyBaseLogger } from 'fastify';
import type { Db } from '../db/client.ts';
import { eventMembers, media, posts } from '../db/schema.ts';

interface Socket {
  readyState: number;
  send: (data: string) => void;
}

const OPEN = 1;

/**
 * Connexions WebSocket ouvertes, par utilisateur. Un message concernant un événement
 * n'est envoyé qu'à ses membres. Un seul processus API : pas besoin de broker.
 */
export class RealtimeHub {
  readonly #sockets = new Map<string, Set<Socket>>();
  readonly #db: Db;
  readonly #log: FastifyBaseLogger;

  constructor(db: Db, log: FastifyBaseLogger) {
    this.#db = db;
    this.#log = log;
  }

  add(userId: string, socket: Socket) {
    const set = this.#sockets.get(userId) ?? new Set();
    set.add(socket);
    this.#sockets.set(userId, set);
  }

  remove(userId: string, socket: Socket) {
    const set = this.#sockets.get(userId);
    set?.delete(socket);
    if (set?.size === 0) this.#sockets.delete(userId);
  }

  get connectionCount() {
    let total = 0;
    for (const set of this.#sockets.values()) total += set.size;
    return total;
  }

  async publish(message: RealtimeMessage) {
    if (this.#sockets.size === 0) return;
    try {
      const members = await this.#db
        .select({ userId: eventMembers.userId })
        .from(eventMembers)
        .where(eq(eventMembers.eventId, message.eventId));
      const payload = JSON.stringify(message);
      for (const { userId } of members) {
        for (const socket of this.#sockets.get(userId) ?? []) {
          if (socket.readyState === OPEN) socket.send(payload);
        }
      }
    } catch (error) {
      this.#log.warn({ err: error }, 'diffusion temps réel impossible');
    }
  }

  /** Une photo vient d'être développée : prévenir les membres de l'événement. */
  async publishMediaReady(mediaId: string) {
    const [row] = await this.#db
      .select({ postId: posts.id, eventId: posts.eventId })
      .from(media)
      .innerJoin(posts, eq(posts.id, media.postId))
      .where(eq(media.id, mediaId))
      .limit(1);
    if (row) await this.publish({ type: 'media.ready', ...row });
  }
}
