import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, ORIGIN } from './helpers.ts';

describe('authentification et profil', () => {
  let t: Awaited<ReturnType<typeof createTestApp>>;
  beforeAll(async () => {
    t = await createTestApp();
    await t.createUser('Dylan', 'dylan@exemple.fr');
  });
  afterAll(() => t.close());

  it('refuse un mauvais mot de passe sans dire si le compte existe', async () => {
    for (const email of ['dylan@exemple.fr', 'inconnu@exemple.fr']) {
      const response = await t.app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        headers: { origin: ORIGIN },
        payload: { email, password: 'pas-le-bon' },
      });
      expect(response.statusCode).toBe(401);
      expect(response.json().error.code).toBe('invalid_credentials');
    }
  });

  it('connecte, met à jour le profil puis déconnecte', async () => {
    const cookie = await t.login('DYLAN@exemple.fr');

    const me = await t.app.inject({ method: 'GET', url: '/api/v1/me', headers: { cookie } });
    expect(me.statusCode).toBe(200);
    expect(me.json()).toMatchObject({ displayName: 'Dylan', theme: 'auto' });
    expect(me.json()).not.toHaveProperty('passwordHash');

    const patched = await t.app.inject({
      method: 'PATCH',
      url: '/api/v1/me',
      headers: { cookie, origin: ORIGIN },
      payload: { theme: 'dark', bio: 'Photographe officiel (non élu)' },
    });
    expect(patched.json()).toMatchObject({ theme: 'dark', bio: 'Photographe officiel (non élu)' });

    const logout = await t.app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
      headers: { cookie, origin: ORIGIN },
    });
    expect(logout.statusCode).toBe(204);

    const after = await t.app.inject({ method: 'GET', url: '/api/v1/me', headers: { cookie } });
    expect(after.statusCode).toBe(401);
  });

  it('pose un cookie de session HttpOnly et SameSite', async () => {
    const response = await t.app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { origin: ORIGIN },
      payload: { email: 'dylan@exemple.fr', password: 'motdepasse' },
    });
    const cookie = response.cookies.find((c) => c.name === 'pa_session');
    expect(cookie).toMatchObject({ httpOnly: true, sameSite: 'Lax', secure: true, path: '/' });
  });

  it('refuse une requête qui modifie venant d’un autre site (CSRF)', async () => {
    const response = await t.app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { origin: 'https://site-malveillant.example' },
      payload: { email: 'dylan@exemple.fr', password: 'motdepasse' },
    });
    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe('bad_origin');
  });
});
