import {
  type CustomReactionDto,
  createCustomReactionSchema,
  customReactionKey,
  isCustomReaction,
  MAX_CUSTOM_REACTIONS_PER_USER,
  type ReactionKey,
} from '@picturart/shared';
import { and, count, desc, eq, inArray, isNull } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import sharp from 'sharp';
import { requireUser } from '../auth/plugin.ts';
import type { Db } from '../db/client.ts';
import {
  customReactions,
  media,
  mediaReactions,
  mediaVariants,
  notifications,
  postReactions,
  posts,
  users,
} from '../db/schema.ts';
import { forbidden, HttpError, notFound, parse } from '../lib/errors.ts';
import type { MediaStorage } from '../media/storage.ts';
import { isUuid, requireMember } from './access.ts';

/** Taille de l'image d'une réaction perso (affichée en 24 à 54 px, nette sur écran Retina). */
const STICKER_SIZE = 160;
const IMMUTABLE = 'private, max-age=31536000, immutable';

/** Une réaction perso existe-t-elle encore ? Les emojis de base sont toujours valides. */
export async function reactionExists(db: Db, key: ReactionKey) {
  if (!isCustomReaction(key)) return true;
  const [row] = await db
    .select({ id: customReactions.id })
    .from(customReactions)
    .where(eq(customReactions.id, key.slice('custom:'.length)))
    .limit(1);
  return Boolean(row);
}

export function customReactionsRoutes(app: FastifyInstance, db: Db, storage: MediaStorage) {
  async function list(where?: ReturnType<typeof eq>): Promise<CustomReactionDto[]> {
    const rows = await db
      .select({
        reaction: customReactions,
        createdBy: { id: users.id, displayName: users.displayName },
      })
      .from(customReactions)
      .innerJoin(users, eq(users.id, customReactions.createdBy))
      .where(where)
      .orderBy(desc(customReactions.createdAt));
    if (rows.length === 0) return [];

    const keys = rows.map((r) => customReactionKey(r.reaction.id));
    const [onPosts, onMedia] = await Promise.all([
      db
        .select({ key: postReactions.emoji, total: count() })
        .from(postReactions)
        .where(inArray(postReactions.emoji, keys))
        .groupBy(postReactions.emoji),
      db
        .select({ key: mediaReactions.emoji, total: count() })
        .from(mediaReactions)
        .where(inArray(mediaReactions.emoji, keys))
        .groupBy(mediaReactions.emoji),
    ]);
    const uses = new Map<string, number>();
    for (const { key, total } of [...onPosts, ...onMedia]) {
      uses.set(key, (uses.get(key) ?? 0) + Number(total));
    }

    return rows.map(({ reaction, createdBy }) => {
      const key = customReactionKey(reaction.id);
      return {
        id: reaction.id,
        key,
        name: reaction.name,
        createdBy,
        createdAt: reaction.createdAt.toISOString(),
        uses: uses.get(key) ?? 0,
      };
    });
  }

  /** Toutes les réactions perso de la bande, les plus récentes d'abord. */
  app.get('/api/v1/custom-reactions', async (request) => {
    requireUser(request);
    return list();
  });

  /** Créer une réaction perso en recadrant une photo qu'on peut voir. */
  app.post(
    '/api/v1/custom-reactions',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const user = requireUser(request);
      const input = parse(createCustomReactionSchema, request.body);

      const [mine] = await db
        .select({ total: count() })
        .from(customReactions)
        .where(eq(customReactions.createdBy, user.id));
      if (Number(mine?.total ?? 0) >= MAX_CUSTOM_REACTIONS_PER_USER) {
        throw new HttpError(
          409,
          'validation',
          `${MAX_CUSTOM_REACTIONS_PER_USER} réactions perso maximum : supprime-en une d’abord.`,
        );
      }

      // Version d'affichage (déjà tournée, sans métadonnées) d'une photo ou d'un aperçu de vidéo
      const [source] = await db
        .select({ eventId: posts.eventId, path: mediaVariants.path })
        .from(media)
        .innerJoin(posts, eq(posts.id, media.postId))
        .innerJoin(
          mediaVariants,
          and(eq(mediaVariants.mediaId, media.id), eq(mediaVariants.variant, 'display')),
        )
        .where(and(eq(media.id, input.mediaId), eq(media.status, 'ready'), isNull(posts.deletedAt)))
        .limit(1);
      if (!source) throw notFound('Photo');
      await requireMember(db, source.eventId, user.id).catch(() => {
        throw notFound('Photo');
      });

      const image = sharp(storage.abs(source.path));
      const { width = 0, height = 0 } = await image.metadata();
      const left = Math.min(width - 1, Math.round(input.crop.x * width));
      const top = Math.min(height - 1, Math.round(input.crop.y * height));
      const region = {
        left,
        top,
        width: Math.max(1, Math.min(width - left, Math.round(input.crop.width * width))),
        height: Math.max(1, Math.min(height - top, Math.round(input.crop.height * height))),
      };

      const [created] = await db
        .insert(customReactions)
        .values({
          name: input.name,
          imagePath: '',
          createdBy: user.id,
          sourceMediaId: input.mediaId,
        })
        .returning();
      if (!created) throw new Error('Réaction perso non créée');
      const imagePath = `stickers/${created.id}.webp`;
      try {
        await storage.ensureDir(imagePath);
        await image
          .extract(region)
          .resize(STICKER_SIZE, STICKER_SIZE, { fit: 'cover' })
          .webp({ quality: 85 })
          .toFile(storage.abs(imagePath));
      } catch (error) {
        await db.delete(customReactions).where(eq(customReactions.id, created.id));
        throw error;
      }
      await db.update(customReactions).set({ imagePath }).where(eq(customReactions.id, created.id));

      const [dto] = await list(eq(customReactions.id, created.id));
      return reply.code(201).send(dto);
    },
  );

  app.get<{ Params: { id: string } }>(
    '/api/v1/custom-reactions/:id/image',
    async (request, reply) => {
      requireUser(request);
      if (!isUuid(request.params.id)) throw notFound('Réaction');
      const [row] = await db
        .select({ path: customReactions.imagePath })
        .from(customReactions)
        .where(eq(customReactions.id, request.params.id))
        .limit(1);
      if (!row?.path) throw notFound('Réaction');
      reply.header('cache-control', IMMUTABLE);
      return reply.sendFile(row.path, { cacheControl: false });
    },
  );

  /** Seule la personne qui l'a créée peut la supprimer ; elle disparaît des posts. */
  app.delete<{ Params: { id: string } }>('/api/v1/custom-reactions/:id', async (request, reply) => {
    const user = requireUser(request);
    if (!isUuid(request.params.id)) throw notFound('Réaction');
    const [row] = await db
      .select()
      .from(customReactions)
      .where(eq(customReactions.id, request.params.id))
      .limit(1);
    if (!row) throw notFound('Réaction');
    if (row.createdBy !== user.id) throw forbidden();

    const key = customReactionKey(row.id);
    await db.transaction(async (tx) => {
      await tx.delete(postReactions).where(eq(postReactions.emoji, key));
      await tx.delete(mediaReactions).where(eq(mediaReactions.emoji, key));
      await tx.delete(notifications).where(eq(notifications.emoji, key));
      await tx.delete(customReactions).where(eq(customReactions.id, row.id));
    });
    if (row.imagePath) await storage.remove(row.imagePath);
    return reply.code(204).send();
  });
}
