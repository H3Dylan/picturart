import { isUuid } from '../modules/access.ts';
import { HttpError } from './errors.ts';

/** Curseur de pagination opaque : date de création + identifiant (ordre stable). */
export function encodeCursor(createdAt: Date, id: string) {
  return Buffer.from(`${createdAt.toISOString()}|${id}`).toString('base64url');
}

export function decodeCursor(cursor: string) {
  const [iso, id] = Buffer.from(cursor, 'base64url').toString('utf8').split('|');
  const date = new Date(iso ?? '');
  if (!id || !isUuid(id) || Number.isNaN(date.getTime())) {
    throw new HttpError(400, 'validation', 'Curseur invalide.');
  }
  return { date, id };
}
