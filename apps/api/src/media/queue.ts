import { eq } from 'drizzle-orm';
import type { FastifyBaseLogger } from 'fastify';
import type { Db } from '../db/client.ts';
import { media } from '../db/schema.ts';
import { processPhoto } from './processor.ts';
import type { MediaStorage } from './storage.ts';

/**
 * File de traitement en mémoire, dans le processus de l'API.
 * Suffisant pour les photos d'une dizaine de personnes ; les vidéos (M4) passeront
 * par un worker séparé. Au démarrage, les médias restés « processing » sont repris.
 */
export class MediaQueue {
  readonly #pending: string[] = [];
  readonly #idle = new Set<() => void>();
  #running = 0;
  readonly #concurrency: number;
  readonly #db: Db;
  readonly #storage: MediaStorage;
  readonly #log: FastifyBaseLogger;

  constructor(db: Db, storage: MediaStorage, log: FastifyBaseLogger, concurrency = 2) {
    this.#db = db;
    this.#storage = storage;
    this.#log = log;
    this.#concurrency = concurrency;
  }

  enqueue(mediaId: string) {
    this.#pending.push(mediaId);
    this.#next();
  }

  async resume() {
    const stuck = await this.#db
      .select({ id: media.id })
      .from(media)
      .where(eq(media.status, 'processing'));
    for (const { id } of stuck) this.enqueue(id);
  }

  /** Résout quand la file est vide (tests, arrêt propre). */
  drained(): Promise<void> {
    if (this.#running === 0 && this.#pending.length === 0) return Promise.resolve();
    return new Promise((resolve) => this.#idle.add(resolve));
  }

  #next() {
    while (this.#running < this.#concurrency && this.#pending.length > 0) {
      const mediaId = this.#pending.shift() as string;
      this.#running++;
      processPhoto(this.#db, this.#storage, mediaId)
        .catch((error) => this.#log.error({ err: error, mediaId }, 'traitement du média échoué'))
        .finally(() => {
          this.#running--;
          this.#next();
          if (this.#running === 0 && this.#pending.length === 0) {
            for (const resolve of this.#idle) resolve();
            this.#idle.clear();
          }
        });
    }
  }
}
