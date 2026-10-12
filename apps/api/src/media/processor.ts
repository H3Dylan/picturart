import { stat } from 'node:fs/promises';
import { eq } from 'drizzle-orm';
import exifr from 'exifr';
import sharp from 'sharp';
import type { Db } from '../db/client.ts';
import { media, mediaVariants } from '../db/schema.ts';
import type { MediaStorage } from './storage.ts';

sharp.concurrency(2);

const VARIANTS = [
  { variant: 'thumb', size: 400, quality: 78 },
  { variant: 'display', size: 2048, quality: 82 },
] as const;

/**
 * Génère la vignette et la version d'affichage d'une photo.
 * - rotation EXIF appliquée ;
 * - métadonnées retirées des versions dérivées (GPS compris) ;
 * - l'original n'est jamais modifié.
 */
export async function processPhoto(db: Db, storage: MediaStorage, mediaId: string) {
  const [row] = await db.select().from(media).where(eq(media.id, mediaId)).limit(1);
  if (!row?.originalPath) throw new Error(`Média ${mediaId} sans original`);
  const original = storage.abs(row.originalPath);

  try {
    const meta = await sharp(original).metadata();
    const rotated = (meta.orientation ?? 1) >= 5;
    const width = (rotated ? meta.height : meta.width) ?? null;
    const height = (rotated ? meta.width : meta.height) ?? null;
    const exif = await exifr
      .parse(original, { pick: ['DateTimeOriginal', 'CreateDate'] })
      .catch(() => null);
    const takenAt: Date | null = exif?.DateTimeOriginal ?? exif?.CreateDate ?? null;

    for (const { variant, size, quality } of VARIANTS) {
      const path = storage.derivedPath(mediaId, variant);
      await storage.ensureDir(path);
      const info = await sharp(original)
        .rotate()
        .resize({ width: size, height: size, fit: 'inside', withoutEnlargement: true })
        .webp({ quality })
        .toFile(storage.abs(path));
      await db
        .insert(mediaVariants)
        .values({
          mediaId,
          variant,
          path,
          width: info.width,
          height: info.height,
          sizeBytes: info.size,
        })
        .onConflictDoUpdate({
          target: [mediaVariants.mediaId, mediaVariants.variant],
          set: { path, width: info.width, height: info.height, sizeBytes: info.size },
        });
    }

    await db
      .update(media)
      .set({
        status: 'ready',
        width,
        height,
        takenAt: takenAt instanceof Date && !Number.isNaN(takenAt.getTime()) ? takenAt : null,
        sizeBytes: (await stat(original)).size,
        error: null,
      })
      .where(eq(media.id, mediaId));
  } catch (error) {
    await db
      .update(media)
      .set({ status: 'failed', error: error instanceof Error ? error.message : String(error) })
      .where(eq(media.id, mediaId));
    throw error;
  }
}
