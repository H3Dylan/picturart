import { healthSchema } from '@picturart/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from './helpers.ts';

describe('GET /api/v1/health', () => {
  let t: Awaited<ReturnType<typeof createTestApp>>;
  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());

  it('répond 200 quand la base répond', async () => {
    const response = await t.app.inject({ method: 'GET', url: '/api/v1/health' });
    expect(response.statusCode).toBe(200);
    expect(healthSchema.parse(response.json())).toMatchObject({ status: 'ok', database: 'ok' });
  });

  it('répond 503 quand la base est injoignable', async () => {
    const original = t.database.ping;
    t.database.ping = async () => false;
    const response = await t.app.inject({ method: 'GET', url: '/api/v1/health' });
    t.database.ping = original;
    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({ status: 'degraded', database: 'down' });
  });
});
