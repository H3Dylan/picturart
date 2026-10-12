import { createHash, randomBytes } from 'node:crypto';

/** Jeton aléatoire non devinable (128 bits par défaut), sûr dans une URL. */
export function randomToken(bytes = 16): string {
  return randomBytes(bytes).toString('base64url');
}

/** Empreinte stockée en base à la place du jeton. */
export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
