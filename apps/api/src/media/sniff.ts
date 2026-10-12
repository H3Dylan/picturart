import { open } from 'node:fs/promises';
import type { MediaKind } from '@picturart/shared';

export interface DetectedFormat {
  kind: MediaKind;
  mime: string;
  extension: string;
}

const HEIF_BRANDS = new Set(['heic', 'heix', 'heim', 'heis', 'hevc', 'hevx', 'hevm', 'hevs']);
/** Marques ISO BMFF qui ne sont pas des vidéos lisibles (images, audio seul). */
const NOT_VIDEO_BRANDS = new Set(['mif1', 'msf1', 'avif', 'avis', 'M4A ', 'M4B ', 'M4P ', 'crx ']);
const QUICKTIME_ATOMS = new Set(['moov', 'mdat', 'wide', 'free', 'skip', 'pnot']);

/**
 * Reconnaît le vrai format d'un fichier à ses premiers octets, sans faire confiance
 * à l'extension ni au type annoncé par le navigateur. Le décodage complet (sharp,
 * libheif, ffprobe) a lieu ensuite dans le worker, qui rejette les fichiers corrompus.
 */
export function detectFormat(head: Uint8Array): DetectedFormat | null {
  const bytes = Buffer.from(head.buffer, head.byteOffset, head.byteLength);
  const ascii = (start: number, end: number) => bytes.toString('latin1', start, end);

  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { kind: 'photo', mime: 'image/jpeg', extension: 'jpg' };
  }
  if (bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { kind: 'photo', mime: 'image/png', extension: 'png' };
  }
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') {
    return { kind: 'photo', mime: 'image/webp', extension: 'webp' };
  }

  // Conteneurs ISO BMFF : HEIC, MP4, MOV
  if (ascii(4, 8) === 'ftyp') {
    const boxSize = Math.min(bytes.readUInt32BE(0), bytes.length);
    const major = ascii(8, 12);
    const brands = [major];
    for (let offset = 16; offset + 4 <= boxSize; offset += 4)
      brands.push(ascii(offset, offset + 4));

    if (brands.some((brand) => HEIF_BRANDS.has(brand))) {
      return { kind: 'photo', mime: 'image/heic', extension: 'heic' };
    }
    if (major === 'qt  ') return { kind: 'video', mime: 'video/quicktime', extension: 'mov' };
    if (NOT_VIDEO_BRANDS.has(major)) return null;
    return { kind: 'video', mime: 'video/mp4', extension: 'mp4' };
  }
  // Anciens fichiers QuickTime sans boîte ftyp
  if (QUICKTIME_ATOMS.has(ascii(4, 8))) {
    return { kind: 'video', mime: 'video/quicktime', extension: 'mov' };
  }
  return null;
}

export async function detectFileFormat(path: string) {
  const file = await open(path, 'r');
  try {
    const head = new Uint8Array(256);
    const { bytesRead } = await file.read(head, 0, head.length, 0);
    return detectFormat(head.subarray(0, bytesRead));
  } finally {
    await file.close();
  }
}
