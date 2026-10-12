import type {
  CreatedInvite,
  CustomReactionDto,
  EventSummary,
  MemoryDto,
  NotificationsPage,
  PostDto,
  ProfileDto,
  ProfileMediaPage,
} from '@picturart/shared';
import { eq } from 'drizzle-orm';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { media } from '../src/db/schema.ts';
import { MemoryJob, parisToday } from '../src/notifications/memories.ts';
import { createTestApp, ORIGIN, sessionCookie, tusUpload } from './helpers.ts';

/** Photo 1200×800 : moitié gauche rouge, moitié droite bleue. */
function halfRedHalfBlue() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800">
    <rect width="600" height="800" fill="#d02020"/><rect x="600" width="600" height="800" fill="#2040d0"/></svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 90 }).toBuffer();
}

describe('M6 : réactions perso, souvenirs, profils', () => {
  let t: Awaited<ReturnType<typeof createTestApp>>;
  let base: string;
  const c: Record<string, string> = {};
  const ids: Record<string, string> = {};
  let bretagne: EventSummary;
  let ski: EventSummary;
  let dylanPost: PostDto;
  let leaPost: PostDto;
  let photoId: string;

  const call = (who: string, method: string, url: string, payload?: object) =>
    t.app.inject({
      method: method as 'GET',
      url,
      headers: { cookie: c[who] ?? '', origin: ORIGIN },
      ...(payload && { payload }),
    });

  async function join(eventId: string, who: string, name: string) {
    const invite: CreatedInvite = (
      await call('dylan', 'POST', `/api/v1/events/${eventId}/invites`)
    ).json();
    const token = invite.url.split('/i/')[1];
    const response = await t.app.inject({
      method: 'POST',
      url: `/api/v1/invites/${token}/accept`,
      headers: { origin: ORIGIN, ...(c[who] && { cookie: c[who] }) },
      ...(!c[who] && {
        payload: { displayName: name, email: `${who}@exemple.fr`, password: 'unbonmotdepasse' },
      }),
    });
    if (!c[who]) {
      c[who] = sessionCookie(response);
      ids[who] = response.json().me.id;
    }
  }

  beforeAll(async () => {
    t = await createTestApp();
    base = await t.app.listen({ port: 0, host: '127.0.0.1' });
    ids.dylan = (await t.createUser('Dylan', 'dylan@exemple.fr')).id;
    c.dylan = await t.login('dylan@exemple.fr');
    bretagne = (
      await call('dylan', 'POST', '/api/v1/events', { name: 'Week-end Bretagne' })
    ).json();
    ski = (await call('dylan', 'POST', '/api/v1/events', { name: 'Ski' })).json();
    await join(bretagne.id, 'lea', 'Léa');
    await join(ski.id, 'max', 'Max');

    // Dylan poste une vraie photo dans Bretagne ; Léa y poste aussi
    const photo = await halfRedHalfBlue();
    dylanPost = (
      await call('dylan', 'POST', '/api/v1/posts', {
        eventId: bretagne.id,
        files: [{ name: 'plage.jpg', size: photo.length, type: 'image/jpeg' }],
      })
    ).json();
    photoId = dylanPost.media[0]?.id ?? '';
    await tusUpload(base, c.dylan ?? '', photoId, photo);
    await t.app.mediaWorker?.idle();
    leaPost = (
      await call('lea', 'POST', '/api/v1/posts', {
        eventId: bretagne.id,
        files: [{ name: 'x.jpg', size: 10, type: 'image/jpeg' }],
      })
    ).json();
  });
  afterAll(() => t.close());

  describe('réactions perso', () => {
    let tom: CustomReactionDto;

    it('se créent en recadrant une photo qu’on peut voir', async () => {
      const created = await call('lea', 'POST', '/api/v1/custom-reactions', {
        mediaId: photoId,
        name: '  Tom choqué ',
        crop: { x: 0.1, y: 0.2, width: 0.3, height: 0.45 },
      });
      expect(created.statusCode).toBe(201);
      tom = created.json();
      expect(tom).toMatchObject({
        name: 'Tom choqué',
        key: `custom:${tom.id}`,
        createdBy: { displayName: 'Léa' },
        uses: 0,
      });

      // Image carrée, prise dans la moitié rouge
      const image = await call('max', 'GET', `/api/v1/custom-reactions/${tom.id}/image`);
      expect(image.headers['cache-control']).toContain('immutable');
      const { data, info } = await sharp(image.rawPayload)
        .raw()
        .toBuffer({ resolveWithObject: true });
      expect(info).toMatchObject({ width: 160, height: 160 });
      expect(data[0]).toBeGreaterThan(150);
      expect(data[2]).toBeLessThan(100);
    });

    it('refuse un recadrage hors cadre, et une photo d’un événement dont on n’est pas', async () => {
      const outside = await call('lea', 'POST', '/api/v1/custom-reactions', {
        mediaId: photoId,
        name: 'Hors cadre',
        crop: { x: 0.8, y: 0, width: 0.5, height: 0.5 },
      });
      expect(outside.statusCode).toBe(400);
      const stranger = await call('max', 'POST', '/api/v1/custom-reactions', {
        mediaId: photoId,
        name: 'Espion',
        crop: { x: 0, y: 0, width: 0.5, height: 0.5 },
      });
      expect(stranger.statusCode).toBe(404);
    });

    it('toute la bande la voit et peut réagir avec', async () => {
      const list: CustomReactionDto[] = (
        await call('max', 'GET', '/api/v1/custom-reactions')
      ).json();
      expect(list.map((r) => r.name)).toEqual(['Tom choqué']);

      const reacted = await call('dylan', 'PUT', `/api/v1/posts/${leaPost.id}/reaction`, {
        emoji: tom.key,
      });
      expect(reacted.json()).toEqual({ counts: [{ emoji: tom.key, count: 1 }], mine: tom.key });
      expect(
        (
          await call('dylan', 'PUT', `/api/v1/posts/${leaPost.id}/reaction`, {
            emoji: 'custom:00000000-0000-4000-8000-000000000000',
          })
        ).statusCode,
      ).toBe(400);

      const activity: NotificationsPage = (
        await call('lea', 'GET', '/api/v1/notifications')
      ).json();
      expect(activity.items[0]).toMatchObject({
        type: 'reaction',
        customReaction: { id: tom.id, name: 'Tom choqué' },
      });
      const again: CustomReactionDto[] = (
        await call('lea', 'GET', '/api/v1/custom-reactions')
      ).json();
      expect(again[0]?.uses).toBe(1);
    });

    it('seule sa créatrice la supprime ; elle disparaît alors des posts', async () => {
      expect((await call('dylan', 'DELETE', `/api/v1/custom-reactions/${tom.id}`)).statusCode).toBe(
        403,
      );
      expect((await call('lea', 'DELETE', `/api/v1/custom-reactions/${tom.id}`)).statusCode).toBe(
        204,
      );
      const post: PostDto = (await call('lea', 'GET', `/api/v1/posts/${leaPost.id}`)).json();
      expect(post.reactions.counts).toEqual([]);
      const activity: NotificationsPage = (
        await call('lea', 'GET', '/api/v1/notifications')
      ).json();
      expect(activity.items.some((n) => n.type === 'reaction')).toBe(false);
      expect(
        (await call('lea', 'GET', `/api/v1/custom-reactions/${tom.id}/image`)).statusCode,
      ).toBe(404);
    });
  });

  describe('souvenirs', () => {
    beforeAll(async () => {
      // La photo de Dylan a été prise il y a un an jour pour jour
      const today = parisToday(new Date());
      await t.database.db
        .update(media)
        .set({ takenAt: new Date(`${today.year - 1}${today.date.slice(4)}T12:00:00Z`) })
        .where(eq(media.id, photoId));
    });

    it('« il y a 1 an » pour les membres de l’événement seulement', async () => {
      const today = parisToday(new Date());
      const lea: MemoryDto[] = (await call('lea', 'GET', '/api/v1/memories')).json();
      expect(lea).toEqual([
        {
          eventId: bretagne.id,
          eventName: 'Week-end Bretagne',
          date: `${today.year - 1}${today.date.slice(4)}`,
          yearsAgo: 1,
          mediaId: photoId,
          photos: 1,
          videos: 0,
        },
      ]);
      expect((await call('max', 'GET', '/api/v1/memories')).json()).toEqual([]);
    });

    it('une notification par souvenir et par jour, à partir de 9 h', async () => {
      const today = parisToday(new Date());
      const at = (time: string) => () => new Date(`${today.date}T${time}Z`);
      expect(await new MemoryJob(t.database.db, t.app.log, at('05:00:00')).run()).toBe(0);
      const job = new MemoryJob(t.database.db, t.app.log, at('09:30:00'));
      expect(await job.run()).toBe(2); // Dylan et Léa
      expect(await job.run()).toBe(0);

      const activity: NotificationsPage = (
        await call('lea', 'GET', '/api/v1/notifications')
      ).json();
      expect(activity.items[0]).toMatchObject({
        type: 'memory',
        actor: null,
        event: { name: 'Week-end Bretagne' },
        mediaId: photoId,
      });
    });
  });

  describe('profils', () => {
    it('stats et événements en commun, calculés sur ce qu’on partage', async () => {
      await call('lea', 'PUT', `/api/v1/posts/${dylanPost.id}/reaction`, { emoji: '😂' });
      await call('lea', 'PUT', `/api/v1/media/${photoId}/reaction`, { emoji: '😂' });

      const seenByLea: ProfileDto = (await call('lea', 'GET', `/api/v1/users/${ids.dylan}`)).json();
      expect(seenByLea).toMatchObject({
        displayName: 'Dylan',
        stats: { posts: 1, reactionsReceived: 2, topReaction: '😂' },
        commonEvents: [{ id: bretagne.id, name: 'Week-end Bretagne' }],
      });

      // Max ne partage que le ski avec Dylan : rien de la Bretagne
      const seenByMax: ProfileDto = (await call('max', 'GET', `/api/v1/users/${ids.dylan}`)).json();
      expect(seenByMax.stats).toEqual({ posts: 0, reactionsReceived: 0, topReaction: null });
      expect(seenByMax.commonEvents.map((e) => e.name)).toEqual(['Ski']);
      const maxGrid: ProfileMediaPage = (
        await call('max', 'GET', `/api/v1/users/${ids.dylan}/media`)
      ).json();
      expect(maxGrid.items).toEqual([]);

      const leaGrid: ProfileMediaPage = (
        await call('lea', 'GET', `/api/v1/users/${ids.dylan}/media`)
      ).json();
      expect(leaGrid.items).toEqual([
        expect.objectContaining({ mediaId: photoId, kind: 'photo', eventId: bretagne.id }),
      ]);
    });

    it('sans événement commun, le profil n’existe pas', async () => {
      expect((await call('max', 'GET', `/api/v1/users/${ids.lea}`)).statusCode).toBe(404);
      expect((await call('max', 'GET', `/api/v1/users/${ids.lea}/media`)).statusCode).toBe(404);
      expect((await call('max', 'GET', '/api/v1/users/pas-un-uuid')).statusCode).toBe(404);
      // Son propre profil, toujours
      expect((await call('max', 'GET', `/api/v1/users/${ids.max}`)).statusCode).toBe(200);
    });
  });
});
