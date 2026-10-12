import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import exifr from 'exifr';
import type { FastifyBaseLogger } from 'fastify';
import sharp from 'sharp';
import type { Config } from '../config.ts';
import type { Db } from '../db/client.ts';
import { media, mediaVariants } from '../db/schema.ts';
import type { MediaStorage } from './storage.ts';
import { run } from './tools.ts';

sharp.concurrency(2);

export type MediaRow = typeof media.$inferSelect;
export type Log = Pick<FastifyBaseLogger, 'info' | 'warn' | 'error'>;
export type Tools = Pick<
  Config,
  'FFMPEG_PATH' | 'FFPROBE_PATH' | 'HEIF_DEC_PATH' | 'VIDEO_HWACCEL' | 'VAAPI_DEVICE'
>;

export interface MediaContext {
  db: Db;
  storage: MediaStorage;
  tools: Tools;
  log: Log;
  signal?: AbortSignal;
}

const IMAGE_VARIANTS = [
  { variant: 'thumb', size: 400, quality: 78 },
  { variant: 'display', size: 2048, quality: 82 },
] as const;

export async function saveVariant(
  db: Db,
  mediaId: string,
  variant: 'thumb' | 'display' | 'video',
  values: { path: string; width: number; height: number; sizeBytes: number },
) {
  await db
    .insert(mediaVariants)
    .values({ mediaId, variant, ...values })
    .onConflictDoUpdate({ target: [mediaVariants.mediaId, mediaVariants.variant], set: values });
}

/**
 * Vignette (400 px) et version d'affichage (2048 px) en WebP, à partir d'une image source.
 * Rotation EXIF appliquée, métadonnées retirées (GPS compris). Renvoie les dimensions affichées.
 */
export async function writeImageVariants(ctx: MediaContext, mediaId: string, source: string) {
  const meta = await sharp(source).metadata();
  const rotated = (meta.orientation ?? 1) >= 5;
  for (const { variant, size, quality } of IMAGE_VARIANTS) {
    const path = ctx.storage.derivedPath(mediaId, variant);
    await ctx.storage.ensureDir(path);
    const info = await sharp(source)
      .rotate()
      .resize({ width: size, height: size, fit: 'inside', withoutEnlargement: true })
      .webp({ quality })
      .toFile(ctx.storage.abs(path));
    await saveVariant(ctx.db, mediaId, variant, {
      path,
      width: info.width,
      height: info.height,
      sizeBytes: info.size,
    });
  }
  return {
    width: (rotated ? meta.height : meta.width) ?? null,
    height: (rotated ? meta.width : meta.height) ?? null,
  };
}

const HEIF_TYPES = new Set(['image/heic', 'image/heif']);

/**
 * Les binaires de sharp ne décodent pas le HEVC (brevets) : les HEIC d'iPhone passent par
 * libheif (`heif-dec`), qui applique la rotation et garde le profil couleur (Display P3).
 */
async function decodeHeif(ctx: MediaContext, mediaId: string, original: string) {
  const dir = await ctx.storage.workDir(mediaId);
  const target = join(dir, 'decoded.jpg');
  await run(ctx.tools.HEIF_DEC_PATH, ['-q', '95', original, target], {
    timeoutMs: 120_000,
    signal: ctx.signal,
  });
  // Les anciennes versions numérotent la sortie quand le fichier contient plusieurs images
  const produced = (await readdir(dir)).filter(
    (f) => f.startsWith('decoded') && f.endsWith('.jpg'),
  );
  const first = produced.includes('decoded.jpg') ? 'decoded.jpg' : produced.sort()[0];
  if (!first) throw new Error('décodage HEIC sans résultat');
  return join(dir, first);
}

/** Photo : versions dérivées, dimensions et date de prise de vue. L'original n'est jamais modifié. */
export async function processPhoto(ctx: MediaContext, row: MediaRow) {
  if (!row.originalPath) throw new Error('média sans original');
  const original = ctx.storage.abs(row.originalPath);
  const source = HEIF_TYPES.has(row.mime ?? '')
    ? await decodeHeif(ctx, row.id, original)
    : original;

  const { width, height } = await writeImageVariants(ctx, row.id, source);
  const readDate = async (file: string): Promise<unknown> => {
    const exif = await exifr
      .parse(file, { pick: ['DateTimeOriginal', 'CreateDate'] })
      .catch(() => null);
    return exif?.DateTimeOriginal ?? exif?.CreateDate ?? null;
  };
  // Le JPEG décodé par libheif garde l'EXIF quand exifr ne sait pas le lire dans le HEIC
  const takenAt =
    (await readDate(original)) ?? (source !== original ? await readDate(source) : null);

  await ctx.db
    .update(media)
    .set({
      status: 'ready',
      width,
      height,
      takenAt: takenAt instanceof Date && !Number.isNaN(takenAt.getTime()) ? takenAt : null,
      sizeBytes: (await stat(original)).size,
      error: null,
    })
    .where(eq(media.id, row.id));
}
