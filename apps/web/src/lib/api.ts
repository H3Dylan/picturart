import type { ApiErrorBody, ErrorCode } from '@picturart/shared';

export class ApiError extends Error {
  readonly status: number;
  readonly code: ErrorCode;
  readonly fields: Record<string, string>;

  constructor(status: number, body: ApiErrorBody | null) {
    super(body?.error.message ?? 'Le serveur ne répond pas. Réessaie dans un instant.');
    this.status = status;
    this.code = body?.error.code ?? 'internal';
    this.fields = body?.error.fields ?? {};
  }
}

/** Appel JSON vers l'API (même origine : le cookie de session part automatiquement). */
export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}) {
  const response = await fetch(`/api/v1${path}`, {
    method: init.method ?? 'GET',
    headers: init.body === undefined ? {} : { 'content-type': 'application/json' },
    body: init.body === undefined ? null : JSON.stringify(init.body),
  });
  if (response.status === 204) return undefined as T;
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new ApiError(response.status, body);
  return body as T;
}
