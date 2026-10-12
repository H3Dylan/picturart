import { createPostSchema, type MediaDto, type PostDto, type PostsPage } from '@picturart/shared';
import { and, asc, desc, eq, inArray, isNull, lt, or } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { requireUser } from '../auth/plugin.ts';
import type { Db } from '../db/client.ts';
import { media, posts, users } from '../db/schema.ts';
import { forbidden, HttpError, notFound, parse } from '../lib/errors.ts';
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

/** Charge les posts avec leur auteur et leurs médias, dans l'ordre donné. */
export async function loadPosts(db: Db, postIds: string[]): Promise<PostDto[]> {
  if (postIds.length === 0) return [];
  const rows = await db
    .select({ post: posts, author: { id: users.id, displayName: users.displayName } })
    .from(posts)
    .innerJoin(users, eq(users.id, posts.authorId))
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

  const byPost = new Map<string, MediaDto[]>();
  for (const m of mediaRows) {
    const list = byPost.get(m.postId) ?? [];
    list.push({
      id: m.id,
      kind: 'photo',
      status: m.status,
      width: m.width,
      height: m.height,
      takenAt: m.takenAt?.toISOString() ?? null,
      position: m.position,
    });
    byPost.set(m.postId, list);
  }

  const byId = new Map(rows.map((r) => [r.post.id, r]));
  return postIds.flatMap((id) => {
    const row = byId.get(id);
    if (!row) return [];
    return [
      {
        id: row.post.id,
        eventId: row.post.eventId,
        author: row.author,
        caption: row.post.caption,
        createdAt: row.post.createdAt.toISOString(),
        media: byPost.get(id) ?? [],
      },
    ];
  });
}

export function postsRoutes(app: FastifyInstance, db: Db) {
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
          originalName: file.name,
          declaredMime: file.type,
          declaredSize: file.size,
        })),
      );
      return post.id;
    });

    const [created] = await loadPosts(db, [postId]);
    return reply.code(201).send(created);
  });

  app.get<{ Params: { id: string }; Querystring: { cursor?: string } }>(
    '/api/v1/events/:id/posts',
    async (request) => {
      const user = requireUser(request);
      if (!isUuid(request.params.id)) throw notFound('Événement');
      await requireMember(db, request.params.id, user.id);

      const cursor = request.query.cursor ? decodeCursor(request.query.cursor) : null;
      const page = await db
        .select({ id: posts.id, createdAt: posts.createdAt })
        .from(posts)
        .where(
          and(
            eq(posts.eventId, request.params.id),
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

      const hasMore = page.length > PAGE_SIZE;
      const visible = page.slice(0, PAGE_SIZE);
      const last = visible.at(-1);
      const body: PostsPage = {
        posts: await loadPosts(
          db,
          visible.map((p) => p.id),
        ),
        nextCursor: hasMore && last ? encodeCursor(last.createdAt, last.id) : null,
      };
      return body;
    },
  );

  /** Mise à la corbeille par l'auteur (suppression définitive après 30 jours). */
  app.delete<{ Params: { id: string } }>('/api/v1/posts/:id', async (request, reply) => {
    const user = requireUser(request);
    if (!isUuid(request.params.id)) throw notFound('Post');
    const [post] = await db
      .select()
      .from(posts)
      .where(and(eq(posts.id, request.params.id), isNull(posts.deletedAt)))
      .limit(1);
    if (!post) throw notFound('Post');
    await requireMember(db, post.eventId, user.id);
    if (post.authorId !== user.id) throw forbidden();

    await db.update(posts).set({ deletedAt: new Date() }).where(eq(posts.id, post.id));
    return reply.code(204).send();
  });
}
