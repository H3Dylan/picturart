import type { NotificationDto } from '@picturart/shared';
import { and, asc, count, desc, eq, inArray, isNull, ne, or, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { Db } from '../db/client.ts';
import { events, media, notifications, posts, users } from '../db/schema.ts';

export type NotificationRow = typeof notifications.$inferSelect;

/**
 * Notifications prêtes à afficher (écran Activité) ou à résumer (push), les plus récentes
 * d'abord. Celles d'un post supprimé sont écartées.
 */
export async function loadNotifications(
  db: Db,
  where: SQL | undefined,
  limit = 30,
): Promise<{ row: NotificationRow; dto: NotificationDto }[]> {
  const reacted = alias(media, 'reacted_media');
  const rows = await db
    .select({
      row: notifications,
      actor: { id: users.id, displayName: users.displayName },
      event: { id: events.id, name: events.name },
      reactedKind: reacted.kind,
    })
    .from(notifications)
    .innerJoin(users, eq(users.id, notifications.actorId))
    .innerJoin(events, eq(events.id, notifications.eventId))
    .leftJoin(posts, eq(posts.id, notifications.postId))
    .leftJoin(reacted, eq(reacted.id, notifications.mediaId))
    .where(and(where, or(isNull(notifications.postId), isNull(posts.deletedAt))))
    .orderBy(desc(notifications.createdAt), desc(notifications.id))
    .limit(limit);

  const postIds = [...new Set(rows.flatMap((r) => (r.row.postId ? [r.row.postId] : [])))];
  const [kinds, thumbs] = postIds.length
    ? await Promise.all([
        db
          .select({ postId: media.postId, kind: media.kind, total: count() })
          .from(media)
          .where(and(inArray(media.postId, postIds), ne(media.status, 'failed')))
          .groupBy(media.postId, media.kind),
        db
          .selectDistinctOn([media.postId], { postId: media.postId, id: media.id })
          .from(media)
          .where(and(inArray(media.postId, postIds), eq(media.status, 'ready')))
          .orderBy(media.postId, asc(media.position)),
      ])
    : [[], []];
  const countOf = (postId: string, kind: 'photo' | 'video') =>
    Number(kinds.find((k) => k.postId === postId && k.kind === kind)?.total ?? 0);
  const thumbOf = new Map(thumbs.map((t) => [t.postId, t.id]));

  return rows.map(({ row, actor, event, reactedKind }) => ({
    row,
    dto: {
      id: row.id,
      type: row.type,
      createdAt: row.createdAt.toISOString(),
      read: row.readAt !== null,
      actor,
      event,
      postId: row.postId,
      mediaId: row.mediaId ?? (row.postId ? (thumbOf.get(row.postId) ?? null) : null),
      target: row.type === 'reaction' ? (row.mediaId ? (reactedKind ?? 'photo') : 'post') : null,
      emoji: row.emoji,
      excerpt: row.excerpt,
      photos: row.postId ? countOf(row.postId, 'photo') : 0,
      videos: row.postId ? countOf(row.postId, 'video') : 0,
    },
  }));
}

export async function unreadCount(db: Db, userId: string) {
  const [row] = await db
    .select({ total: count() })
    .from(notifications)
    .leftJoin(posts, eq(posts.id, notifications.postId))
    .where(
      and(
        eq(notifications.userId, userId),
        isNull(notifications.readAt),
        or(isNull(notifications.postId), isNull(posts.deletedAt)),
      ),
    );
  return Number(row?.total ?? 0);
}
