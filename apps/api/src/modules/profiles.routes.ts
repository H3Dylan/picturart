import type {
  ProfileDto,
  ProfileMediaItem,
  ProfileMediaPage,
  ReactionKey,
} from '@picturart/shared';
import { aliasedTable, and, count, desc, eq, inArray, isNull, lt, ne, or, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { requireUser } from '../auth/plugin.ts';
import type { Db } from '../db/client.ts';
import {
  eventMembers,
  events,
  media,
  mediaReactions,
  postReactions,
  posts,
  users,
} from '../db/schema.ts';
import { decodeCursor, encodeCursor } from '../lib/cursor.ts';
import { notFound } from '../lib/errors.ts';
import { isUuid } from './access.ts';

const PAGE_SIZE = 30;

export function profilesRoutes(app: FastifyInstance, db: Db) {
  /**
   * Événements que l'on partage avec quelqu'un (tous les siens pour son propre profil).
   * Un profil ne se voit qu'avec au moins un événement en commun, et n'en montre que ça.
   */
  async function sharedEvents(viewerId: string, targetId: string) {
    const target = aliasedTable(eventMembers, 'target_member');
    const rows = await db
      .select({ id: events.id, name: events.name })
      .from(eventMembers)
      .innerJoin(target, and(eq(target.eventId, eventMembers.eventId), eq(target.userId, targetId)))
      .innerJoin(events, eq(events.id, eventMembers.eventId))
      .where(and(eq(eventMembers.userId, viewerId), isNull(events.archivedAt)))
      .orderBy(desc(events.createdAt));
    return rows;
  }

  async function findProfile(viewerId: string, targetId: string) {
    if (!isUuid(targetId)) throw notFound('Profil');
    const [user] = await db.select().from(users).where(eq(users.id, targetId)).limit(1);
    const common = user ? await sharedEvents(viewerId, targetId) : [];
    // Pas d'événement commun : on ne révèle pas l'existence du compte
    if (!user || (common.length === 0 && viewerId !== targetId)) throw notFound('Profil');
    return { user, common };
  }

  app.get<{ Params: { id: string } }>('/api/v1/users/:id', async (request) => {
    const viewer = requireUser(request);
    const { user, common } = await findProfile(viewer.id, request.params.id);
    const eventIds = common.map((e) => e.id);
    const scope = and(
      eq(posts.authorId, user.id),
      isNull(posts.deletedAt),
      eventIds.length ? inArray(posts.eventId, eventIds) : sql`false`,
    );

    const [postCount, onPosts, onMedia] = await Promise.all([
      db.select({ total: count() }).from(posts).where(scope),
      db
        .select({ key: postReactions.emoji, total: count() })
        .from(postReactions)
        .innerJoin(posts, eq(posts.id, postReactions.postId))
        // Ses propres réactions ne comptent pas comme reçues
        .where(and(scope, ne(postReactions.userId, user.id)))
        .groupBy(postReactions.emoji),
      db
        .select({ key: mediaReactions.emoji, total: count() })
        .from(mediaReactions)
        .innerJoin(media, eq(media.id, mediaReactions.mediaId))
        .innerJoin(posts, eq(posts.id, media.postId))
        .where(and(scope, ne(mediaReactions.userId, user.id)))
        .groupBy(mediaReactions.emoji),
    ]);

    const received = new Map<string, number>();
    for (const { key, total } of [...onPosts, ...onMedia]) {
      received.set(key, (received.get(key) ?? 0) + Number(total));
    }
    const top = [...received].sort((a, b) => b[1] - a[1])[0];

    const body: ProfileDto = {
      id: user.id,
      displayName: user.displayName,
      bio: user.bio,
      memberSince: user.createdAt.toISOString(),
      stats: {
        posts: Number(postCount[0]?.total ?? 0),
        reactionsReceived: [...received.values()].reduce((sum, n) => sum + n, 0),
        topReaction: (top?.[0] as ReactionKey | undefined) ?? null,
      },
      commonEvents: common,
    };
    return body;
  });

  /** Ses photos et vidéos, dans les événements partagés, des plus récentes aux plus anciennes. */
  app.get<{ Params: { id: string }; Querystring: { cursor?: string } }>(
    '/api/v1/users/:id/media',
    async (request) => {
      const viewer = requireUser(request);
      const { user, common } = await findProfile(viewer.id, request.params.id);
      if (common.length === 0) return { items: [], nextCursor: null } satisfies ProfileMediaPage;
      const cursor = request.query.cursor ? decodeCursor(request.query.cursor) : null;

      const rows = await db
        .select({
          mediaId: media.id,
          postId: posts.id,
          eventId: posts.eventId,
          kind: media.kind,
          durationMs: media.durationMs,
          takenAt: media.takenAt,
          createdAt: media.createdAt,
        })
        .from(media)
        .innerJoin(posts, eq(posts.id, media.postId))
        .where(
          and(
            eq(posts.authorId, user.id),
            isNull(posts.deletedAt),
            eq(media.status, 'ready'),
            inArray(
              posts.eventId,
              common.map((e) => e.id),
            ),
            cursor
              ? or(
                  lt(media.createdAt, cursor.date),
                  and(eq(media.createdAt, cursor.date), lt(media.id, cursor.id)),
                )
              : undefined,
          ),
        )
        .orderBy(desc(media.createdAt), desc(media.id))
        .limit(PAGE_SIZE + 1);

      const page = rows.slice(0, PAGE_SIZE);
      const last = page.at(-1);
      const body: ProfileMediaPage = {
        items: page.map(
          (r): ProfileMediaItem => ({
            mediaId: r.mediaId,
            postId: r.postId,
            eventId: r.eventId,
            kind: r.kind,
            durationMs: r.durationMs,
            date: (r.takenAt ?? r.createdAt).toISOString(),
          }),
        ),
        nextCursor:
          rows.length > PAGE_SIZE && last ? encodeCursor(last.createdAt, last.mediaId) : null,
      };
      return body;
    },
  );
}
