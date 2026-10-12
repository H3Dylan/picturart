import { healthSchema } from '@picturart/shared';
import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.ts';

describe('GET /api/v1/health', () => {
  it('répond 200 quand la base répond', async () => {
    const app = buildApp({ version: 'test', pingDatabase: async () => true });

    const response = await app.inject({ method: 'GET', url: '/api/v1/health' });

    expect(response.statusCode).toBe(200);
    expect(healthSchema.parse(response.json())).toEqual({
      status: 'ok',
      database: 'ok',
      version: 'test',
    });
  });

  it('répond 503 quand la base est injoignable', async () => {
    const app = buildApp({ version: 'test', pingDatabase: async () => false });

    const response = await app.inject({ method: 'GET', url: '/api/v1/health' });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({ status: 'degraded', database: 'down' });
  });
});
