import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, rename, rm } from 'node:fs/promises';
import { dirname, join, posix, resolve } from 'node:path';

/**
 * Arborescence des médias :
 *   uploads/                     envois tus en cours
 *   originals/AAAA/MM/<id>.<ext> originaux, jamais modifiés
 *   derived/<id>/<variante>.webp vignettes et versions d'affichage
 */
export class MediaStorage {
  readonly root: string;
  readonly uploadsDir: string;

  constructor(root: string) {
    this.root = resolve(root);
    this.uploadsDir = join(this.root, 'uploads');
  }

  async init() {
    await mkdir(this.uploadsDir, { recursive: true });
  }

  abs(relativePath: string) {
    return join(this.root, relativePath);
  }

  originalPath(mediaId: string, extension: string, date = new Date()) {
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    return posix.join('originals', String(date.getUTCFullYear()), month, `${mediaId}.${extension}`);
  }

  derivedPath(mediaId: string, variant: string) {
    return posix.join('derived', mediaId, `${variant}.webp`);
  }

  async move(fromAbs: string, toRelative: string) {
    const target = this.abs(toRelative);
    await mkdir(dirname(target), { recursive: true });
    await rename(fromAbs, target);
  }

  async ensureDir(relativeFile: string) {
    await mkdir(dirname(this.abs(relativeFile)), { recursive: true });
  }

  async remove(relativePath: string) {
    await rm(this.abs(relativePath), { force: true, recursive: true });
  }
}

export function sha256File(path: string): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    const hash = createHash('sha256');
    createReadStream(path)
      .on('data', (chunk) => hash.update(chunk))
      .on('error', reject)
      .on('end', () => resolvePromise(hash.digest('hex')));
  });
}
