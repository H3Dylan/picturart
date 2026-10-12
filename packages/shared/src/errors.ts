export const ERROR_CODES = [
  'validation',
  'unauthenticated',
  'forbidden',
  'not_found',
  'invalid_credentials',
  'email_taken',
  'invite_invalid',
  'rate_limited',
  'bad_origin',
  'internal',
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export interface ApiErrorBody {
  error: {
    code: ErrorCode;
    message: string;
    /** Erreurs par champ, pour les formulaires. */
    fields?: Record<string, string>;
  };
}
