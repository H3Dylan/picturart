import type { ApiErrorBody, ErrorCode } from '@picturart/shared';
import type { z } from 'zod';

export class HttpError extends Error {
  readonly status: number;
  readonly code: ErrorCode;
  readonly fields: Record<string, string> | undefined;

  constructor(status: number, code: ErrorCode, message: string, fields?: Record<string, string>) {
    super(message);
    this.status = status;
    this.code = code;
    this.fields = fields;
  }

  toBody(): ApiErrorBody {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...(this.fields && { fields: this.fields }),
      },
    };
  }
}

export const unauthenticated = () =>
  new HttpError(401, 'unauthenticated', 'Connecte-toi pour continuer.');
export const forbidden = () =>
  new HttpError(403, 'forbidden', 'Tu n’as pas les droits pour faire ça.');
export const notFound = (what = 'Ressource') =>
  new HttpError(404, 'not_found', `${what} introuvable.`);

/** Valide une entrée avec Zod ; en cas d'erreur, renvoie un 400 avec un message par champ. */
export function parse<T extends z.ZodType>(schema: T, input: unknown): z.infer<T> {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  const fields: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = issue.path.join('.') || '_';
    fields[key] ??= issue.message;
  }
  throw new HttpError(400, 'validation', 'Certains champs sont invalides.', fields);
}
