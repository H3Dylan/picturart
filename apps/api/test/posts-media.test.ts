import type {
  CreatedInvite,
  EventDetail,
  EventSummary,
  PostDto,
  PostsPage,
} from '@picturart/shared';
import exifr from 'exifr';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, ORIGIN, sessionCookie } from './helpers.ts';

const b64 = (value: string) => Buffer.from(value).toString('base64');

/** Photo de test 3000×2000 avec date de prise de vue et coordonnées GPS. */
async function testPhoto() {
  return sharp({ create: { width: 3000, height: 2000, channels: 3, background: '#e9a866' } })
    .jpeg({ quality: 90 })
    .withExif({
      IFD0: { Make: 'Pictur Test' },
      IFD2: { DateTimeOriginal: '2026:07:13 14:02:00' },
      IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '47/1 29/1 0/1' },
    })
    .toBuffer();
}

describe('posts, envoi tus et médias', () => {
  let t: Awaited<ReturnType<typeof createTestApp>>;
  const cookies: Record<string, string> = {};
  let event: EventSummary;
  let photo: Buffer;

  const inject = (who: string, method: string, url: string, payload?: unknown) =>
    t.app.inject({
      method: method as 'GET',
      url,
      headers: { cookie: cookies[who] ?? '', origin: ORIGIN },
      ...(payload !== undefined && { payload: payload as object }),
    });

  // L'envoi tus passe par un vrai serveur HTTP local : le serveur tus lit le flux réseau brut,
  // que l'injection de requêtes de Fastify ne simule pas.
  let base: string;

  async function upload(who: string, mediaId: string, body: Buffer) {
    const headers = { cookie: cookies[who] ?? '', origin: ORIGIN, 'tus-resumable': '1.0.0' };
    const created = await fetch(`${base}/api/v1/uploads`, {
      method: 'POST',
      headers: {
        ...headers,
        'upload-length': String(body.length),
        'upload-metadata': `mediaId ${b64(mediaId)},filename ${b64('photo.jpg')}`,
      },
    });
    if (created.status !== 201) return { statusCode: created.status };
    const location = new URL(created.headers.get('location') ?? '', base).pathname;
    const patched = await fetch(`${base}${location}`, {
      method: 'PATCH',
      headers: {
        ...headers,
        'upload-offset': '0',
        'content-type': 'application/offset+octet-stream',
      },
      body: new Uint8Array(body),
    });
    return { statusCode: patched.status };
  }

  async function createPost(who: string, files: { name: string; size: number; type: string }[]) {
    return inject(who, 'POST', '/api/v1/posts', { eventId: event.id, caption: 'La plage', files });
  }

  beforeAll(async () => {
    t = await createTestApp();
    base = await t.app.listen({ port: 0, host: '127.0.0.1' });
    photo = await testPhoto();
    await t.createUser('Dylan', 'dylan@exemple.fr');
    await t.createUser('Intrus', 'intrus@exemple.fr');
    cookies.dylan = await t.login('dylan@exemple.fr');
    cookies.intrus = await t.login('intrus@exemple.fr');

    event = (await inject('dylan', 'POST', '/api/v1/events', { name: 'Bretagne' })).json();
    const invite: CreatedInvite = (
      await inject('dylan', 'POST', `/api/v1/events/${event.id}/invites`)
    ).json();
    const token = invite.url.split('/i/')[1];
    for (const [name, email] of [
      ['Léa', 'lea@exemple.fr'],
      ['Max', 'max@exemple.fr'],
    ] as const) {
      const response = await t.app.inject({
        method: 'POST',
        url: `/api/v1/invites/${token}/accept`,
        headers: { origin: ORIGIN },
        payload: { displayName: name, email, password: 'unbonmotdepasse' },
      });
      cookies[name === 'Léa' ? 'lea' : 'max'] = sessionCookie(response);
    }
    const detail: EventDetail = (await inject('dylan', 'GET', `/api/v1/events/${event.id}`)).json();
    const max = detail.members.find((m) => m.displayName === 'Max');
    await inject('dylan', 'PATCH', `/api/v1/events/${event.id}/members/${max?.id}`, {
      role: 'viewer',
    });
  });
  afterAll(() => t.close());

  let post: PostDto;

  it('un contributeur crée un post, ses médias attendent l’envoi', async () => {
    const response = await createPost('lea', [
      { name: 'plage.jpg', size: photo.length, type: 'image/jpeg' },
    ]);
    expect(response.statusCode).toBe(201);
    post = response.json();
    expect(post).toMatchObject({ caption: 'La plage', author: { displayName: 'Léa' } });
    expect(post.media).toEqual([expect.objectContaining({ status: 'uploading', position: 0 })]);
  });

  it('un lecteur ne peut pas poster', async () => {
    const response = await createPost('max', [{ name: 'x.jpg', size: 10, type: 'image/jpeg' }]);
    expect(response.statusCode).toBe(403);
  });

  it('refuse les formats non pris en charge', async () => {
    const response = await createPost('lea', [
      { name: 'doc.pdf', size: 10, type: 'application/pdf' },
    ]);
    expect(response.statusCode).toBe(400);
  });

  it('personne d’autre ne peut envoyer le fichier d’un média', async () => {
    const response = await upload('dylan', post.media[0]?.id ?? '', photo);
    expect(response.statusCode).toBe(404);
  });

  it('envoie la photo (tus), puis génère vignette et version d’affichage', async () => {
    const response = await upload('lea', post.media[0]?.id ?? '', photo);
    expect(response.statusCode).toBe(204);
    await t.app.mediaQueue.drained();

    const page: PostsPage = (
      await inject('dylan', 'GET', `/api/v1/events/${event.id}/posts`)
    ).json();
    expect(page.posts[0]?.media[0]).toMatchObject({
      status: 'ready',
      width: 3000,
      height: 2000,
      takenAt: expect.stringMatching(/^2026-07-13/),
    });
  });

  it('conserve l’original à l’octet près', async () => {
    const response = await inject('dylan', 'GET', `/api/v1/media/${post.media[0]?.id}/original`);
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toBe('image/jpeg');
    expect(response.rawPayload.equals(photo)).toBe(true);
  });

  it('sert des versions WebP redimensionnées, sans GPS', async () => {
    const display = await inject('dylan', 'GET', `/api/v1/media/${post.media[0]?.id}/display`);
    expect(display.headers['content-type']).toBe('image/webp');
    expect(display.headers['cache-control']).toContain('private');
    expect((await sharp(display.rawPayload).metadata()).width).toBe(2048);
    expect(await exifr.gps(display.rawPayload).catch(() => undefined)).toBeUndefined();

    const thumb = await inject('dylan', 'GET', `/api/v1/media/${post.media[0]?.id}/thumb`);
    expect((await sharp(thumb.rawPayload).metadata()).width).toBe(400);
  });

  it('ne montre pas les photos aux non-membres', async () => {
    const response = await inject('intrus', 'GET', `/api/v1/media/${post.media[0]?.id}/display`);
    expect(response.statusCode).toBe(404);
    const posts = await inject('intrus', 'GET', `/api/v1/events/${event.id}/posts`);
    expect(posts.statusCode).toBe(404);
  });

  it('écarte un faux fichier image', async () => {
    const fake = Buffer.from('ceci n’est pas une photo');
    const created: PostDto = (
      await createPost('lea', [{ name: 'faux.jpg', size: fake.length, type: 'image/jpeg' }])
    ).json();
    await upload('lea', created.media[0]?.id ?? '', fake);
    const page: PostsPage = (await inject('lea', 'GET', `/api/v1/events/${event.id}/posts`)).json();
    const reloaded = page.posts.find((p) => p.id === created.id);
    expect(reloaded?.media).toEqual([]);
  });

  it('compte les photos dans le détail de l’événement', async () => {
    const detail: EventDetail = (await inject('lea', 'GET', `/api/v1/events/${event.id}`)).json();
    expect(detail).toMatchObject({ photoCount: 1, memberCount: 3, role: 'contributor' });
  });

  it('seul l’auteur peut supprimer son post', async () => {
    expect((await inject('dylan', 'DELETE', `/api/v1/posts/${post.id}`)).statusCode).toBe(403);
    expect((await inject('lea', 'DELETE', `/api/v1/posts/${post.id}`)).statusCode).toBe(204);
    const media = await inject('dylan', 'GET', `/api/v1/media/${post.media[0]?.id}/display`);
    expect(media.statusCode).toBe(404);
  });
});

describe('membres d’un événement', () => {
  let t: Awaited<ReturnType<typeof createTestApp>>;
  let dylan: string;
  let lea: string;
  let event: EventSummary;
  let leaId: string;

  beforeAll(async () => {
    t = await createTestApp();
    const d = await t.createUser('Dylan', 'dylan@exemple.fr');
    const l = await t.createUser('Léa', 'lea@exemple.fr');
    leaId = l.id;
    dylan = await t.login('dylan@exemple.fr');
    lea = await t.login('lea@exemple.fr');
    event = (
      await t.app.inject({
        method: 'POST',
        url: '/api/v1/events',
        headers: { cookie: dylan, origin: ORIGIN },
        payload: { name: 'Ski' },
      })
    ).json();
    const invite: CreatedInvite = (
      await t.app.inject({
        method: 'POST',
        url: `/api/v1/events/${event.id}/invites`,
        headers: { cookie: dylan, origin: ORIGIN },
      })
    ).json();
    await t.app.inject({
      method: 'POST',
      url: `/api/v1/invites/${invite.url.split('/i/')[1]}/accept`,
      headers: { cookie: lea, origin: ORIGIN },
    });
    expect(d.id).toBeTruthy();
  });
  afterAll(() => t.close());

  const call = (cookie: string, method: string, url: string, payload?: object) =>
    t.app.inject({
      method: method as 'PATCH',
      url,
      headers: { cookie, origin: ORIGIN },
      ...(payload && { payload }),
    });

  it('un contributeur ne peut pas changer les rôles', async () => {
    const response = await call(lea, 'PATCH', `/api/v1/events/${event.id}/members/${leaId}`, {
      role: 'admin',
    });
    expect(response.statusCode).toBe(403);
  });

  it('le dernier admin ne peut pas partir', async () => {
    const me = (await call(dylan, 'GET', '/api/v1/me')).json();
    const response = await call(dylan, 'DELETE', `/api/v1/events/${event.id}/members/${me.id}`);
    expect(response.statusCode).toBe(409);
  });

  it('un admin promeut un membre, qui peut ensuite partir', async () => {
    const promoted = await call(dylan, 'PATCH', `/api/v1/events/${event.id}/members/${leaId}`, {
      role: 'admin',
    });
    expect(promoted.json().members).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: leaId, role: 'admin' })]),
    );
    const left = await call(lea, 'DELETE', `/api/v1/events/${event.id}/members/${leaId}`);
    expect(left.statusCode).toBe(204);
    expect((await call(lea, 'GET', `/api/v1/events/${event.id}`)).statusCode).toBe(404);
  });
});
