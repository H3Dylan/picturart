import type { MemoryDto } from '@picturart/shared';
import { and, count, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { Db } from '../db/client.ts';
import {
  eventMembers,
  events,
  media,
  mediaReactions,
  notifications,
  posts,
  users,
} from '../db/schema.ts';
import type { Log } from '../media/processor.ts';

const ZONE = 'Europe/Paris';
/** Les souvenirs du jour partent en notification à partir de 9 h (heure de Paris). */
const NOTIFY_FROM_HOUR = 9;

/** Date du jour à Paris : AAAA-MM-JJ, et l'heure. */
export function parisToday(now: Date) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: ZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
  };
}

/**
 * Souvenirs du jour : les journées passées (même jour, même mois, années précédentes) des
 * événements dont on est membre, avec la photo la plus aimée de chaque journée.
 * Un média compte au jour de sa prise de vue, sinon de son envoi, à l'heure de Paris.
 */
export async function memoriesFor(db: Db, userId: string, now = new Date()): Promise<MemoryDto[]> {
  const today = parisToday(now);
  const day = sql<string>`to_char((coalesce(${media.takenAt}, ${media.createdAt}) at time zone ${ZONE})::date, 'YYYY-MM-DD')`;
  const reactionCount = db
    .select({ mediaId: mediaReactions.mediaId, total: count().as('total') })
    .from(mediaReactions)
    .groupBy(mediaReactions.mediaId)
    .as('reaction_count');

  const rows = await db
    .select({
      mediaId: media.id,
      kind: media.kind,
      eventId: events.id,
      eventName: events.name,
      day,
      reactions: sql<number>`coalesce(${reactionCount.total}, 0)`,
    })
    .from(media)
    .innerJoin(posts, eq(posts.id, media.postId))
    .innerJoin(events, eq(events.id, posts.eventId))
    .innerJoin(
      eventMembers,
      and(eq(eventMembers.eventId, events.id), eq(eventMembers.userId, userId)),
    )
    .leftJoin(reactionCount, eq(reactionCount.mediaId, media.id))
    .where(
      and(
        eq(media.status, 'ready'),
        isNull(posts.deletedAt),
        isNull(events.archivedAt),
        sql`to_char((coalesce(${media.takenAt}, ${media.createdAt}) at time zone ${ZONE})::date, 'MM-DD') = ${today.date.slice(5)}`,
        sql`extract(year from (coalesce(${media.takenAt}, ${media.createdAt}) at time zone ${ZONE})) < ${today.year}`,
      ),
    );

  const groups = new Map<string, MemoryDto & { best: number }>();
  for (const row of rows) {
    const key = `${row.eventId}|${row.day}`;
    const group = groups.get(key) ?? {
      eventId: row.eventId,
      eventName: row.eventName,
      date: row.day,
      yearsAgo: today.year - Number(row.day.slice(0, 4)),
      mediaId: row.mediaId,
      photos: 0,
      videos: 0,
      best: -1,
    };
    if (row.kind === 'video') group.videos++;
    else group.photos++;
    // La plus aimée ; à égalité, une photo plutôt qu'une vidéo
    const score = Number(row.reactions) * 2 + (row.kind === 'photo' ? 1 : 0);
    if (score > group.best) {
      group.best = score;
      group.mediaId = row.mediaId;
    }
    groups.set(key, group);
  }
  return [...groups.values()]
    .map(({ best: _best, ...memory }) => memory)
    .sort((a, b) => a.yearsAgo - b.yearsAgo || a.eventName.localeCompare(b.eventName));
}

/**
 * Chaque jour, une notification « souvenir » par journée passée (écran Activité, et push
 * pour qui a gardé « Un souvenir refait surface »). Idempotent : relancer ne double rien.
 */
export class MemoryJob {
  readonly #db: Db;
  readonly #log: Log;
  readonly #now: () => Date;
  #timer: NodeJS.Timeout | undefined;

  constructor(db: Db, log: Log, now = () => new Date()) {
    this.#db = db;
    this.#log = log;
    this.#now = now;
  }

  start(intervalMs = 15 * 60_000) {
    void this.run();
    this.#timer = setInterval(() => void this.run(), intervalMs);
  }

  stop() {
    clearInterval(this.#timer);
  }

  async run() {
    try {
      const now = this.#now();
      if (parisToday(now).hour < NOTIFY_FROM_HOUR) return 0;
      let created = 0;
      for (const { id } of await this.#db.select({ id: users.id }).from(users)) {
        const memories = await memoriesFor(this.#db, id, now);
        if (memories.length === 0) continue;
        const already = await this.#db
          .select({ eventId: notifications.eventId, excerpt: notifications.excerpt })
          .from(notifications)
          .where(
            and(
              eq(notifications.userId, id),
              eq(notifications.type, 'memory'),
              inArray(
                notifications.excerpt,
                memories.map((m) => m.date),
              ),
            ),
          );
        const done = new Set(already.map((n) => `${n.eventId}|${n.excerpt}`));
        const fresh = memories.filter((m) => !done.has(`${m.eventId}|${m.date}`));
        if (fresh.length === 0) continue;
        await this.#db.insert(notifications).values(
          fresh.map((m) => ({
            userId: id,
            type: 'memory' as const,
            eventId: m.eventId,
            mediaId: m.mediaId,
            excerpt: m.date,
          })),
        );
        created += fresh.length;
      }
      if (created) this.#log.info({ created }, 'souvenirs du jour');
      return created;
    } catch (error) {
      this.#log.error({ err: error }, 'souvenirs du jour');
      return 0;
    }
  }
}
