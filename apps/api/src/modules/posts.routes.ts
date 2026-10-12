import {
  type CommentDto,
  createPostSchema,
  type MediaDto,
  type PostDto,
  type PostsPage,
  type ReactionEmoji,
  type Reactions,
} from '@picturart/shared';
import { and, asc, count, desc, eq, inArray, isNull, lt, or, type SQL } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { requireUser } from '../auth/plugin.ts';
import type { Db } from '../db/client.ts';
import {
  comments,
  eventMembers,
  events,
  media,
  mediaReactions,
  postReactions,
  posts,
  users,
} from '../db/schema.ts';
import { forbidden, HttpError, notFound, parse } from '../lib/errors.ts';
import type { RealtimeHub } from '../realtime/hub.ts';
import { isUuid, requireMember } from './access.ts';

const PAGE_SIZE = 20;

function encodeCursor(createdAt: Date, id: string) {
  return Buffer.from(`${createdAt.toISOString()}|${id}`).toString('base64url');
}

function decodeCursor(cursor: string) {
  const [iso, id] = Buffer.from(cursor, 'base64url').toString('utf8').split('|');
  const date = new Date(iso ?? '');
  if (!id || !isUuid(id) || Number.isNaN(date.getTime())) {
    throw new HttpError(400, 'validation', 'Curseur invalide.');
  }
  return { date, id };
}

function groupReactions(
  rows: { target: string; emoji: string; total: number }[],
  mine: { target: string; emoji: string }[],
) {
  const byTarget = new Map<string, Reactions>();
  const get = (target: string) => {
    let entry = byTarget.get(target);
    if (!entry) {
      entry = { counts: [], mine: null };
      byTarget.set(target, entry);
    }
    return entry;
  };
  for (const row of rows) {
    get(row.target).counts.push({ emoji: row.emoji as ReactionEmoji, count: Number(row.total) });
  }
  for (const row of mine) get(row.target).mine = row.emoji as ReactionEmoji;
  for (const entry of byTarget.values()) entry.counts.sort((a, b) => b.count - a.count);
  return byTarget;
}

const noReactions = (): Reactions => ({ counts: [], mine: null });

/** Charge les posts avec auteur, événement, médias, réactions et commentaires, dans l'ordre donné. */
export async function loadPosts(db: Db, postIds: string[], userId: string): Promise<PostDto[]> {
  if (postIds.length === 0) return [];

  const rows = await db
    .select({
      post: posts,
      author: { id: users.id, displayName: users.displayName },
      event: { id: events.id, name: events.name },
    })
    .from(posts)
    .innerJoin(users, eq(users.id, posts.authorId))
    .innerJoin(events, eq(events.id, posts.eventId))
    .where(inArray(posts.id, postIds));

  const mediaRows = await db
    .select()
    .from(media)
    .where(
      and(
        inArray(media.postId, postIds),
        inArray(media.status, ['uploading', 'processing', 'ready']),
      ),
    )
    .orderBy(asc(media.position));
  const mediaIds = mediaRows.map((m) => m.id);

  const [postCounts, postMine, mediaCounts, mediaMine, commentCounts, lastComments] =
    await Promise.all([
      db
        .select({ target: postReactions.postId, emoji: postReactions.emoji, total: count() })
        .from(postReactions)
        .where(inArray(postReactions.postId, postIds))
        .groupBy(postReactions.postId, postReactions.emoji),
      db
        .select({ target: postReactions.postId, emoji: postReactions.emoji })
        .from(postReactions)
        .where(and(inArray(postReactions.postId, postIds), eq(postReactions.userId, userId))),
      mediaIds.length
        ? db
            .select({ target: mediaReactions.mediaId, emoji: mediaReactions.emoji, total: count() })
            .from(mediaReactions)
            .where(inArray(mediaReactions.mediaId, mediaIds))
            .groupBy(mediaReactions.mediaId, mediaReactions.emoji)
        : [],
      mediaIds.length
        ? db
            .select({ target: mediaReactions.mediaId, emoji: mediaReactions.emoji })
            .from(mediaReactions)
            .where(
              and(inArray(mediaReactions.mediaId, mediaIds), eq(mediaReactions.userId, userId)),
            )
        : [],
      db
        .select({ postId: comments.postId, total: count() })
        .from(comments)
        .where(and(inArray(comments.postId, postIds), isNull(comments.deletedAt)))
        .groupBy(comments.postId),
      db
        .selectDistinctOn([comments.postId], {
          comment: comments,
          author: { id: users.id, displayName: users.displayName },
        })
        .from(comments)
        .innerJoin(users, eq(users.id, comments.authorId))
        .where(and(inArray(comments.postId, postIds), isNull(comments.deletedAt)))
        .orderBy(comments.postId, desc(comments.createdAt)),
    ]);

  const postReactionsBy = groupReactions(postCounts, postMine);
  const mediaReactionsBy = groupReactions(mediaCounts, mediaMine);
  const commentCountBy = new Map(commentCounts.map((c) => [c.postId, Number(c.total)]));
  const lastCommentBy = new Map<string, CommentDto>(
    lastComments.map(({ comment, author }) => [
      comment.postId,
      {
        id: comment.id,
        postId: comment.postId,
        author,
        body: comment.body,
        createdAt: comment.createdAt.toISOString(),
      },
    ]),
  );

  const mediaBy = new Map<string, MediaDto[]>();
  for (const m of mediaRows) {
    const list = mediaBy.get(m.postId) ?? [];
    list.push({
      id: m.id,
      kind: m.kind,
      status: m.status,
      width: m.width,
      height: m.height,
      durationMs: m.durationMs,
      takenAt: m.takenAt?.toISOString() ?? null,
      position: m.position,
      reactions: mediaReactionsBy.get(m.id) ?? noReactions(),
    });
    mediaBy.set(m.postId, list);
  }

  const byId = new Map(rows.map((r) => [r.post.id, r]));
  return postIds.flatMap((id) => {
    const row = byId.get(id);
    if (!row) return [];
    return [
      {
        id: row.post.id,
        eventId: row.post.eventId,
        event: row.event,
        author: row.author,
        caption: row.post.caption,
        createdAt: row.post.createdAt.toISOString(),
        media: mediaBy.get(id) ?? [],
        reactions: postReactionsBy.get(id) ?? noReactions(),
        commentCount: commentCountBy.get(id) ?? 0,
        lastComment: lastCommentBy.get(id) ?? null,
      },
    ];
  });
}

/** Page de posts (du plus récent au plus ancien), filtrée par `scope`. */
async function pagePosts(db: Db, userId: string, scope: SQL, cursorParam?: string) {
  const cursor = cursorParam ? decodeCursor(cursorParam) : null;
  const page = await db
    .select({ id: posts.id, createdAt: posts.createdAt })
    .from(posts)
    .where(
      and(
        scope,
        isNull(posts.deletedAt),
        cursor
          ? or(
              lt(posts.createdAt, cursor.date),
              and(eq(posts.createdAt, cursor.date), lt(posts.id, cursor.id)),
            )
          : undefined,
      ),
    )
    .orderBy(desc(posts.createdAt), desc(posts.id))
    .limit(PAGE_SIZE + 1);

  const visible = page.slice(0, PAGE_SIZE);
  const last = visible.at(-1);
  const body: PostsPage = {
    posts: await loadPosts(
      db,
      visible.map((p) => p.id),
      userId,
    ),
    nextCursor: page.length > PAGE_SIZE && last ? encodeCursor(last.createdAt, last.id) : null,
  };
  return body;
}

/** Post visible par l'utilisateur (membre de son événement, pas à la corbeille). */
export async function findVisiblePost(db: Db, postId: string, userId: string) {
  if (!isUuid(postId)) throw notFound('Post');
  const [post] = await db
    .select()
    .from(posts)
    .where(and(eq(posts.id, postId), isNull(posts.deletedAt)))
    .limit(1);
  if (!post) throw notFound('Post');
  const role = await requireMember(db, post.eventId, userId).catch(() => {
    throw notFound('Post');
  });
  return { post, role };
}

export function postsRoutes(app: FastifyInstance, db: Db, hub: RealtimeHub) {
  app.post('/api/v1/posts', async (request, reply) => {
    const user = requireUser(request);
    const input = parse(createPostSchema, request.body);
    await requireMember(db, input.eventId, user.id, ['admin', 'contributor']);

    const postId = await db.transaction(async (tx) => {
      const [post] = await tx
        .insert(posts)
        .values({ eventId: input.eventId, authorId: user.id, caption: input.caption })
        .returning({ id: posts.id });
      if (!post) throw new Error('Création du post impossible');
      await tx.insert(media).values(
        input.files.map((file, position) => ({
          postId: post.id,
          uploaderId: user.id,
          position,
          // Type annoncé, confirmé par les premiers octets à la fin de l'envoi
          kind: file.type.startsWith('video/') ? ('video' as const) : ('photo' as const),
          originalName: file.name,
          declaredMime: file.type,
          declaredSize: file.size,
        })),
      );
      return post.id;
    });

    const [created] = await loadPosts(db, [postId], user.id);
    void hub.publish({ type: 'post.created', eventId: input.eventId, postId });
    return reply.code(201).send(created);
  });

  /** Fil : les posts de tous mes événements. */
  app.get<{ Querystring: { cursor?: string } }>('/api/v1/feed', async (request) => {
    const user = requireUser(request);
    const myEvents = db
      .select({ eventId: eventMembers.eventId })
      .from(eventMembers)
      .where(eq(eventMembers.userId, user.id));
    return pagePosts(db, user.id, inArray(posts.eventId, myEvents), request.query.cursor);
  });

  app.get<{ Params: { id: string }; Querystring: { cursor?: string } }>(
    '/api/v1/events/:id/posts',
    async (request) => {
      const user = requireUser(request);
      if (!isUuid(request.params.id)) throw notFound('Événement');
      await requireMember(db, request.params.id, user.id);
      return pagePosts(db, user.id, eq(posts.eventId, request.params.id), request.query.cursor);
    },
  );

  app.get<{ Params: { id: string } }>('/api/v1/posts/:id', async (request) => {
    const user = requireUser(request);
    const { post } = await findVisiblePost(db, request.params.id, user.id);
    const [dto] = await loadPosts(db, [post.id], user.id);
    return dto;
  });

  /** Mise à la corbeille par l'auteur (suppression définitive après 30 jours). */
  app.delete<{ Params: { id: string } }>('/api/v1/posts/:id', async (request, reply) => {
    const user = requireUser(request);
    const { post } = await findVisiblePost(db, request.params.id, user.id);
    if (post.authorId !== user.id) throw forbidden();

    await db.update(posts).set({ deletedAt: new Date() }).where(eq(posts.id, post.id));
    void hub.publish({ type: 'post.deleted', eventId: post.eventId, postId: post.id });
    return reply.code(204).send();
  });
}
