import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import type { MediaKind } from '@picturart/shared';
import { and, asc, eq, gte, inArray, isNotNull, isNull, sql } from 'drizzle-orm';
import type { Database } from '../db/client.ts';
import { media } from '../db/schema.ts';
import {
  type Log,
  type MediaContext,
  type MediaRow,
  processPhoto,
  type Tools,
} from './processor.ts';
import type { MediaStorage } from './storage.ts';
import { processVideo } from './video.ts';

/** L'API signale un nouveau média à traiter. */
export const JOBS_CHANNEL = 'media_jobs';
/** Le worker signale un média traité (prêt ou en échec), l'API prévient alors les membres. */
export const DONE_CHANNEL = 'media_done';

const MAX_ATTEMPTS = 3;
const POLL_MS = 15_000;
/** Travaux en parallèle par type : une vidéo 4K ne bloque pas les photos. */
const LANES = { photo: 2, video: 1 } satisfies Record<MediaKind, number>;

interface WorkerDeps {
  database: Database;
  storage: MediaStorage;
  tools: Tools;
  log: Log;
}

/**
 * Traitement des médias en arrière-plan. La file, c'est la table `media` elle-même :
 * un média `processing` non réservé est pris avec `FOR UPDATE SKIP LOCKED`, sans Redis ni pg-boss.
 * Réveil par LISTEN/NOTIFY, et relecture régulière par sécurité.
 *
 * Une seule instance à la fois (conteneur `worker` en production, processus de l'API en
 * développement) : au démarrage, elle reprend les médias qu'un arrêt brutal a laissés réservés.
 */
export class MediaWorker {
  readonly #deps: WorkerDeps;
  readonly #running = { photo: 0, video: 0 } satisfies Record<MediaKind, number>;
  readonly #idle = new Set<() => void>();
  readonly #abort = new AbortController();
  #pumping: Promise<void> | null = null;
  #again = false;
  #timer: NodeJS.Timeout | undefined;
  #unlisten: (() => Promise<void>) | undefined;
  #stopped = false;

  constructor(deps: WorkerDeps) {
    this.#deps = deps;
  }

  async start() {
    const { db } = this.#deps.database;
    await db
      .update(media)
      .set({ processingStartedAt: null })
      .where(and(eq(media.status, 'processing'), isNotNull(media.processingStartedAt)));
    this.#unlisten = await this.#deps.database.listen(JOBS_CHANNEL, () => void this.pump());
    this.#timer = setInterval(() => void this.pump(), POLL_MS);
    await this.pump();
  }

  /** Arrêt propre : plus de nouveaux travaux, ffmpeg interrompu (le média sera repris au redémarrage). */
  async stop() {
    this.#stopped = true;
    clearInterval(this.#timer);
    await this.#unlisten?.();
    this.#abort.abort();
    await this.#waitIdle();
  }

  /** Résout quand plus rien n'est à traiter (tests). */
  async idle() {
    await this.pump();
    await this.#waitIdle();
  }

  #waitIdle() {
    if (this.#busy === 0 && !this.#pumping) return Promise.resolve();
    return new Promise<void>((resolve) => this.#idle.add(resolve));
  }

  get #busy() {
    return this.#running.photo + this.#running.video;
  }

  #settle() {
    if (this.#busy > 0 || this.#pumping) return;
    for (const resolve of this.#idle) resolve();
    this.#idle.clear();
  }

  /** Réserve autant de travaux que les voies le permettent. Les appels concurrents sont regroupés. */
  pump(): Promise<void> {
    if (this.#pumping) {
      this.#again = true;
      return this.#pumping;
    }
    this.#pumping = (async () => {
      do {
        this.#again = false;
        if (this.#stopped) break;
        await this.#failExhausted();
        for (const kind of ['photo', 'video'] as const) {
          while (!this.#stopped && this.#running[kind] < LANES[kind]) {
            const job = await this.#claim(kind);
            if (!job) break;
            this.#run(job);
          }
        }
      } while (this.#again);
    })()
      .catch((error) => this.#deps.log.error({ err: error }, 'file des médias indisponible'))
      .finally(() => {
        this.#pumping = null;
        this.#settle();
      });
    return this.#pumping;
  }

  async #claim(kind: MediaKind): Promise<MediaRow | undefined> {
    const { db } = this.#deps.database;
    const next = db
      .select({ id: media.id })
      .from(media)
      .where(
        and(
          eq(media.status, 'processing'),
          eq(media.kind, kind),
          isNull(media.processingStartedAt),
          sql`${media.attempts} < ${MAX_ATTEMPTS}`,
        ),
      )
      .orderBy(asc(media.createdAt))
      .limit(1)
      .for('update', { skipLocked: true });
    const [job] = await db
      .update(media)
      .set({ attempts: sql`${media.attempts} + 1`, processingStartedAt: new Date() })
      .where(inArray(media.id, next))
      .returning();
    return job;
  }

  /** Un média qui a fait tomber le worker plusieurs fois n'est plus retenté. */
  async #failExhausted() {
    const { db } = this.#deps.database;
    const failed = await db
      .update(media)
      .set({ status: 'failed', error: 'traitement interrompu à plusieurs reprises' })
      .where(
        and(
          eq(media.status, 'processing'),
          isNull(media.processingStartedAt),
          gte(media.attempts, MAX_ATTEMPTS),
        ),
      )
      .returning({ id: media.id });
    for (const { id } of failed) await this.#deps.database.notify(DONE_CHANNEL, id);
  }

  #run(job: MediaRow) {
    const { database, storage, tools, log } = this.#deps;
    this.#running[job.kind]++;
    const ctx: MediaContext = { db: database.db, storage, tools, log, signal: this.#abort.signal };
    const started = Date.now();

    (job.kind === 'video' ? processVideo(ctx, job) : processPhoto(ctx, job))
      .then(() =>
        log.info({ mediaId: job.id, kind: job.kind, ms: Date.now() - started }, 'média prêt'),
      )
      .catch(async (error: unknown) => {
        if (this.#abort.signal.aborted) {
          // Arrêt du worker : le média reste « processing » et sera repris
          await database.db
            .update(media)
            .set({ processingStartedAt: null, attempts: sql`${media.attempts} - 1` })
            .where(eq(media.id, job.id));
          return;
        }
        log.error({ err: error, mediaId: job.id }, 'traitement du média échoué');
        await database.db
          .update(media)
          .set({ status: 'failed', error: error instanceof Error ? error.message : String(error) })
          .where(eq(media.id, job.id));
      })
      .then(async () => {
        await rm(join(storage.root, 'tmp', job.id), { recursive: true, force: true });
        if (!this.#abort.signal.aborted) await database.notify(DONE_CHANNEL, job.id);
      })
      .catch((error: unknown) => log.error({ err: error, mediaId: job.id }, 'fin de traitement'))
      .finally(() => {
        this.#running[job.kind]--;
        if (this.#stopped) this.#settle();
        else void this.pump();
      });
  }
}
