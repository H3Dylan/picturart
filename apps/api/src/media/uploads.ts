import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { MAX_FILE_BYTES } from '@picturart/shared';
import { FileStore } from '@tus/file-store';
import { Server } from '@tus/server';
import { eq } from 'drizzle-orm';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import sharp from 'sharp';
import { requireUser } from '../auth/plugin.ts';
import type { Db } from '../db/client.ts';
import { media } from '../db/schema.ts';
import { HttpError, notFound } from '../lib/errors.ts';
import { isUuid } from '../modules/access.ts';
import type { MediaQueue } from './queue.ts';
import { type MediaStorage, sha256File } from './storage.ts';

const UPLOADS_PATH = '/api/v1/uploads';
const EXTENSIONS: Record<string, string> = { jpeg: 'jpg', png: 'png', webp: 'webp' };

/** Lit l'en-tête tus « Upload-Metadata » : `clé base64,clé base64`. */
export function parseUploadMetadata(header: string | undefined) {
  const metadata: Record<string, string> = {};
  for (const pair of (header ?? '').split(',')) {
    const [key, value] = pair.trim().split(' ');
    if (key) metadata[key] = value ? Buffer.from(value, 'base64').toString('utf8') : '';
  }
  return metadata;
}

/**
 * Envoi terminé : vérification du vrai format, empreinte, rangement de l'original,
 * puis mise en file pour générer les vignettes.
 */
export async function finalizeUpload(
  db: Db,
  storage: MediaStorage,
  queue: MediaQueue,
  mediaId: string,
) {
  const uploaded = join(storage.uploadsDir, mediaId);
  try {
    const { format } = await sharp(uploaded).metadata();
    const extension = format ? EXTENSIONS[format] : undefined;
    if (!extension) throw new Error(`format non pris en charge : ${format ?? 'inconnu'}`);

    const sha = await sha256File(uploaded);
    const originalPath = storage.originalPath(mediaId, extension);
    await storage.move(uploaded, originalPath);
    await db
      .update(media)
      .set({ status: 'processing', originalPath, sha256: sha, mime: `image/${format}` })
      .where(eq(media.id, mediaId));
    queue.enqueue(mediaId);
  } catch (error) {
    await db
      .update(media)
      .set({ status: 'failed', error: error instanceof Error ? error.message : String(error) })
      .where(eq(media.id, mediaId));
    await rm(uploaded, { force: true });
  } finally {
    await rm(`${uploaded}.json`, { force: true });
  }
}

export function registerUploads(
  app: FastifyInstance,
  db: Db,
  storage: MediaStorage,
  queue: MediaQueue,
) {
  const tus = new Server({
    path: UPLOADS_PATH,
    datastore: new FileStore({ directory: storage.uploadsDir }),
    maxSize: MAX_FILE_BYTES,
    respectForwardedHeaders: true,
    // Adresse relative : valable derrière Traefik comme derrière le proxy de développement
    generateUrl: (_req, { path, id }) => `${path}/${id}`,
    // L'identifiant de l'envoi est celui du média, déjà vérifié avant d'arriver ici
    namingFunction: (_req, metadata) => metadata?.mediaId ?? '',
    onUploadFinish: async (_req, upload) => {
      await finalizeUpload(db, storage, queue, upload.id);
      return {};
    },
  });

  // Le corps des PATCH tus est un flux binaire lu directement par le serveur tus
  app.addContentTypeParser('application/offset+octet-stream', (_request, _payload, done) =>
    done(null),
  );

  async function checkAccess(request: FastifyRequest) {
    const user = requireUser(request);
    const mediaId =
      request.method === 'POST'
        ? parseUploadMetadata(request.headers['upload-metadata'] as string | undefined).mediaId
        : request.url.split('?')[0]?.split('/').pop();
    if (!mediaId || !isUuid(mediaId)) throw notFound('Envoi');

    const [row] = await db.select().from(media).where(eq(media.id, mediaId)).limit(1);
    if (!row || row.uploaderId !== user.id) throw notFound('Envoi');
    if (row.status !== 'uploading') {
      throw new HttpError(409, 'validation', 'Ce fichier a déjà été envoyé.');
    }
    if (
      request.method === 'POST' &&
      Number(request.headers['upload-length']) !== row.declaredSize
    ) {
      throw new HttpError(400, 'validation', 'Taille du fichier inattendue.');
    }
  }

  const handler = async (request: FastifyRequest, reply: import('fastify').FastifyReply) => {
    await checkAccess(request);
    reply.hijack();
    await tus.handle(request.raw, reply.raw);
  };

  app.route({ method: ['POST', 'PATCH', 'HEAD', 'DELETE'], url: UPLOADS_PATH, handler });
  app.route({ method: ['POST', 'PATCH', 'HEAD', 'DELETE'], url: `${UPLOADS_PATH}/*`, handler });
}
