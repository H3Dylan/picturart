import {
  type CommentDto,
  commentSchema,
  type PlancheItem,
  reactionSchema,
} from '@picturart/shared';
import { and, asc, count, desc, eq, isNull, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { requireUser } from '../auth/plugin.ts';
import type { Db } from '../db/client.ts';
import { comments, media, mediaReactions, postReactions, posts, users } from '../db/schema.ts';
import { forbidden, notFound, parse } from '../lib/errors.ts';
import type { RealtimeHub } from '../realtime/hub.ts';
import { isUuid, requireMember } from './access.ts';
import { findVisiblePost, loadPosts } from './posts.routes.ts';

export function socialRoutes(app: FastifyInstance, db: Db, hub: RealtimeHub) {
  /** Photo visible par l'utilisateur, avec son post. */
  async function findVisibleMedia(mediaId: string, userId: string) {
    if (!isUuid(mediaId)) throw notFound('Photo');
    const [row] = await db
      .select({ mediaId: media.id, postId: posts.id, eventId: posts.eventId })
      .from(media)
      .innerJoin(posts, eq(posts.id, media.postId))
      .where(and(eq(media.id, mediaId), isNull(posts.deletedAt), eq(media.status, 'ready')))
      .limit(1);
    if (!row) throw notFound('Photo');
    await requireMember(db, row.eventId, userId).catch(() => {
      throw notFound('Photo');
    });
    return row;
  }

  // ---- Réactions sur un post ----------------------------------------------------------
  app.put<{ Params: { id: string } }>('/api/v1/posts/:id/reaction', async (request) => {
    const user = requireUser(request);
    const { post } = await findVisiblePost(db, request.params.id, user.id);
    const { emoji } = parse(reactionSchema, request.body);
    await db
      .insert(postReactions)
      .values({ postId: post.id, userId: user.id, emoji })
      .onConflictDoUpdate({
        target: [postReactions.postId, postReactions.userId],
        set: { emoji, createdAt: new Date() },
      });
    void hub.publish({ type: 'reaction.updated', eventId: post.eventId, postId: post.id });
    const [dto] = await loadPosts(db, [post.id], user.id);
    return dto?.reactions;
  });

  app.delete<{ Params: { id: string } }>('/api/v1/posts/:id/reaction', async (request) => {
    const user = requireUser(request);
    const { post } = await findVisiblePost(db, request.params.id, user.id);
    await db
      .delete(postReactions)
      .where(and(eq(postReactions.postId, post.id), eq(postReactions.userId, user.id)));
    void hub.publish({ type: 'reaction.updated', eventId: post.eventId, postId: post.id });
    const [dto] = await loadPosts(db, [post.id], user.id);
    return dto?.reactions;
  });

  // ---- Réactions sur une photo --------------------------------------------------------
  async function mediaReactionsOf(postId: string, mediaId: string, userId: string) {
    const [dto] = await loadPosts(db, [postId], userId);
    return dto?.media.find((m) => m.id === mediaId)?.reactions;
  }

  app.put<{ Params: { id: string } }>('/api/v1/media/:id/reaction', async (request) => {
    const user = requireUser(request);
    const row = await findVisibleMedia(request.params.id, user.id);
    const { emoji } = parse(reactionSchema, request.body);
    await db
      .insert(mediaReactions)
      .values({ mediaId: row.mediaId, userId: user.id, emoji })
      .onConflictDoUpdate({
        target: [mediaReactions.mediaId, mediaReactions.userId],
        set: { emoji, createdAt: new Date() },
      });
    void hub.publish({ type: 'reaction.updated', ...row });
    return mediaReactionsOf(row.postId, row.mediaId, user.id);
  });

  app.delete<{ Params: { id: string } }>('/api/v1/media/:id/reaction', async (request) => {
    const user = requireUser(request);
    const row = await findVisibleMedia(request.params.id, user.id);
    await db
      .delete(mediaReactions)
      .where(and(eq(mediaReactions.mediaId, row.mediaId), eq(mediaReactions.userId, user.id)));
    void hub.publish({ type: 'reaction.updated', ...row });
    return mediaReactionsOf(row.postId, row.mediaId, user.id);
  });

  // ---- Commentaires ----------------------------------------------------------------------
  app.get<{ Params: { id: string } }>('/api/v1/posts/:id/comments', async (request) => {
    const user = requireUser(request);
    const { post } = await findVisiblePost(db, request.params.id, user.id);
    const rows = await db
      .select({ comment: comments, author: { id: users.id, displayName: users.displayName } })
      .from(comments)
      .innerJoin(users, eq(users.id, comments.authorId))
      .where(and(eq(comments.postId, post.id), isNull(comments.deletedAt)))
      .orderBy(asc(comments.createdAt));
    return rows.map(
      ({ comment, author }): CommentDto => ({
        id: comment.id,
        postId: comment.postId,
        author,
        body: comment.body,
        createdAt: comment.createdAt.toISOString(),
      }),
    );
  });

  app.post<{ Params: { id: string } }>(
    '/api/v1/posts/:id/comments',
    { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const user = requireUser(request);
      const { post } = await findVisiblePost(db, request.params.id, user.id);
      const { body } = parse(commentSchema, request.body);
      const [comment] = await db
        .insert(comments)
        .values({ postId: post.id, authorId: user.id, body })
        .returning();
      if (!comment) throw new Error('Commentaire non créé');
      void hub.publish({ type: 'comment.created', eventId: post.eventId, postId: post.id });
      const dto: CommentDto = {
        id: comment.id,
        postId: post.id,
        author: { id: user.id, displayName: user.displayName },
        body: comment.body,
        createdAt: comment.createdAt.toISOString(),
      };
      return reply.code(201).send(dto);
    },
  );

  app.delete<{ Params: { id: string } }>('/api/v1/comments/:id', async (request, reply) => {
    const user = requireUser(request);
    if (!isUuid(request.params.id)) throw notFound('Commentaire');
    const [comment] = await db
      .select()
      .from(comments)
      .where(and(eq(comments.id, request.params.id), isNull(comments.deletedAt)))
      .limit(1);
    if (!comment) throw notFound('Commentaire');
    const { post } = await findVisiblePost(db, comment.postId, user.id);
    if (comment.authorId !== user.id) throw forbidden();
    await db.update(comments).set({ deletedAt: new Date() }).where(eq(comments.id, comment.id));
    void hub.publish({ type: 'comment.deleted', eventId: post.eventId, postId: post.id });
    return reply.code(204).send();
  });

  // ---- Planche contact et meilleures photos -------------------------------------------
  app.get<{ Params: { id: string }; Querystring: { tri?: string } }>(
    '/api/v1/events/:id/media',
    async (request) => {
      const user = requireUser(request);
      if (!isUuid(request.params.id)) throw notFound('Événement');
      await requireMember(db, request.params.id, user.id);
      const best = request.query.tri === 'meilleures';

      const reactionCount = db
        .select({ mediaId: mediaReactions.mediaId, total: count().as('total') })
        .from(mediaReactions)
        .groupBy(mediaReactions.mediaId)
        .as('reaction_count');

      const rows = await db
        .select({
          mediaId: media.id,
          postId: posts.id,
          author: { id: users.id, displayName: users.displayName },
          kind: media.kind,
          width: media.width,
          height: media.height,
          durationMs: media.durationMs,
          takenAt: media.takenAt,
          createdAt: media.createdAt,
          reactionCount: sql<number>`coalesce(${reactionCount.total}, 0)`,
        })
        .from(media)
        .innerJoin(posts, eq(posts.id, media.postId))
        .innerJoin(users, eq(users.id, posts.authorId))
        .leftJoin(reactionCount, eq(reactionCount.mediaId, media.id))
        .where(
          and(
            eq(posts.eventId, request.params.id),
            isNull(posts.deletedAt),
            eq(media.status, 'ready'),
          ),
        )
        .orderBy(
          ...(best
            ? [desc(sql`coalesce(${reactionCount.total}, 0)`), desc(media.createdAt)]
            : [asc(sql`coalesce(${media.takenAt}, ${media.createdAt})`), asc(media.position)]),
        )
        .limit(best ? 30 : 500);

      return rows
        .filter((r) => !best || Number(r.reactionCount) > 0)
        .map(
          (r): PlancheItem => ({
            mediaId: r.mediaId,
            postId: r.postId,
            author: r.author,
            kind: r.kind,
            width: r.width,
            height: r.height,
            durationMs: r.durationMs,
            takenAt: r.takenAt?.toISOString() ?? null,
            reactionCount: Number(r.reactionCount),
          }),
        );
    },
  );
}
