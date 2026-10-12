import { MEDIA_VARIANTS, type MediaVariant } from '@picturart/shared';
import { and, eq, isNull } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { requireUser } from '../auth/plugin.ts';
import type { Db } from '../db/client.ts';
import { media, mediaVariants, posts } from '../db/schema.ts';
import { notFound } from '../lib/errors.ts';
import { isUuid, requireMember } from './access.ts';

const IMMUTABLE = 'private, max-age=31536000, immutable';

export function mediaRoutes(app: FastifyInstance, db: Db) {
  app.get<{ Params: { id: string; variant: string } }>(
    '/api/v1/media/:id/:variant',
    async (request, reply) => {
      const user = requireUser(request);
      const { id, variant } = request.params;
      if (!isUuid(id) || !MEDIA_VARIANTS.includes(variant as MediaVariant)) throw notFound('Média');

      const [row] = await db
        .select({ media, eventId: posts.eventId })
        .from(media)
        .innerJoin(posts, eq(posts.id, media.postId))
        .where(and(eq(media.id, id), isNull(posts.deletedAt)))
        .limit(1);
      if (!row) throw notFound('Média');
      // Contrôle d'appartenance à chaque requête : un lien ne suffit pas pour voir une photo
      await requireMember(db, row.eventId, user.id);

      if (variant === 'original') {
        if (!row.media.originalPath) throw notFound('Média');
        reply.header('cache-control', IMMUTABLE);
        reply.header(
          'content-disposition',
          `inline; filename*=UTF-8''${encodeURIComponent(row.media.originalName)}`,
        );
        return reply.sendFile(row.media.originalPath, { cacheControl: false });
      }

      const [derived] = await db
        .select({ path: mediaVariants.path })
        .from(mediaVariants)
        .where(
          and(
            eq(mediaVariants.mediaId, id),
            eq(mediaVariants.variant, variant as 'thumb' | 'display'),
          ),
        )
        .limit(1);
      if (!derived) throw notFound('Média');
      reply.header('cache-control', IMMUTABLE);
      return reply.sendFile(derived.path, { cacheControl: false });
    },
  );
}
