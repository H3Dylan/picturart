import type {
  CreatedInvite,
  EventSummary,
  Me,
  NotificationDto,
  NotificationsPage,
  PostDto,
} from '@picturart/shared';
import { summarizeForPush } from '@picturart/shared';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pushSubscriptions } from '../src/db/schema.ts';
import { PushDispatcher, type PushTarget } from '../src/notifications/dispatcher.ts';
import { createTestApp, ORIGIN, sessionCookie } from './helpers.ts';

const MINUTE = 60_000;

describe('résumé des notifications push', () => {
  const base: NotificationDto = {
    id: '1',
    type: 'post',
    createdAt: '2026-10-12T10:00:00Z',
    read: false,
    actor: { id: 'lea', displayName: 'Léa' },
    event: { id: 'bzh', name: 'Week-end Bretagne' },
    postId: 'p1',
    mediaId: null,
    target: null,
    emoji: null,
    excerpt: null,
    photos: 6,
    videos: 0,
  };

  it('une salve d’envois devient une seule notification', () => {
    const payload = summarizeForPush(
      [base, { ...base, photos: 9, videos: 2 }, { ...base, photos: 2 }],
      3,
    );
    expect(payload).toEqual({
      title: 'Week-end Bretagne',
      body: 'Léa a ajouté 17 photos et 2 vidéos',
      url: '/evenements/bzh?vue=posts',
      tag: 'event-bzh',
      unread: 3,
    });
  });

  it('plusieurs personnes, plusieurs événements', () => {
    const payload = summarizeForPush(
      [
        base,
        { ...base, actor: { id: 'max', displayName: 'Max' }, event: { id: 'ski', name: 'Ski' } },
      ],
      2,
    );
    expect(payload?.body).toBe('Léa et Max ont ajouté 12 photos dans tes événements');
    expect(payload?.url).toBe('/activite');
  });

  it('réactions et commentaires : la plus récente, et le compte des autres', () => {
    const reaction = { ...base, type: 'reaction' as const, emoji: '😂', target: 'photo' as const };
    const comment = { ...base, type: 'comment' as const, excerpt: 'je vois Sami au fond' };
    expect(summarizeForPush([reaction], 1)?.body).toBe('Léa a réagi 😂 à ta photo');
    expect(summarizeForPush([reaction, comment], 2)?.body).toBe(
      'Léa a commenté : « je vois Sami au fond » · et 1 autre nouveauté',
    );
  });
});

describe('notifications : écran Activité, préférences et push', () => {
  let t: Awaited<ReturnType<typeof createTestApp>>;
  const c: Record<string, string> = {};
  const ids: Record<string, string> = {};
  let event: EventSummary;

  const call = (who: string, method: string, url: string, payload?: object) =>
    t.app.inject({
      method: method as 'GET',
      url,
      headers: { cookie: c[who] ?? '', origin: ORIGIN },
      ...(payload && { payload }),
    });
  const activity = async (who: string): Promise<NotificationsPage> =>
    (await call(who, 'GET', '/api/v1/notifications')).json();
  const post = async (who: string, files: { name: string; type: string }[]): Promise<PostDto> =>
    (
      await call(who, 'POST', '/api/v1/posts', {
        eventId: event.id,
        files: files.map((f) => ({ ...f, size: 1000 })),
      })
    ).json();

  beforeAll(async () => {
    t = await createTestApp();
    ids.dylan = (await t.createUser('Dylan', 'dylan@exemple.fr')).id;
    c.dylan = await t.login('dylan@exemple.fr');
    event = (await call('dylan', 'POST', '/api/v1/events', { name: 'Week-end Bretagne' })).json();
    const invite: CreatedInvite = (
      await call('dylan', 'POST', `/api/v1/events/${event.id}/invites`)
    ).json();
    const token = invite.url.split('/i/')[1];
    for (const [key, name] of [
      ['lea', 'Léa'],
      ['max', 'Max'],
    ] as const) {
      const response = await t.app.inject({
        method: 'POST',
        url: `/api/v1/invites/${token}/accept`,
        headers: { origin: ORIGIN },
        payload: { displayName: name, email: `${key}@exemple.fr`, password: 'unbonmotdepasse' },
      });
      c[key] = sessionCookie(response);
      ids[key] = (response.json() as { me: Me }).me.id;
    }
  });
  afterAll(() => t.close());

  it('les arrivées dans l’événement apparaissent chez les autres membres', async () => {
    const dylan = await activity('dylan');
    expect(dylan.items.map((n) => `${n.actor.displayName} ${n.type}`)).toEqual([
      'Max member',
      'Léa member',
    ]);
    expect((await activity('lea')).items.map((n) => n.actor.displayName)).toEqual(['Max']);
    expect((await activity('max')).items).toEqual([]);
  });

  let lea: PostDto;

  it('un post prévient toute la bande, sauf son auteur, avec le compte des médias', async () => {
    lea = await post('lea', [
      { name: 'a.jpg', type: 'image/jpeg' },
      { name: 'b.heic', type: 'image/heic' },
      { name: 'c.mov', type: 'video/quicktime' },
    ]);
    const [first] = (await activity('dylan')).items;
    expect(first).toMatchObject({
      type: 'post',
      actor: { displayName: 'Léa' },
      event: { name: 'Week-end Bretagne' },
      postId: lea.id,
      photos: 2,
      videos: 1,
      read: false,
    });
    expect((await activity('max')).items[0]?.type).toBe('post');
    expect((await activity('lea')).items.some((n) => n.type === 'post')).toBe(false);
  });

  it('une réaction prévient l’auteur ; changer d’emoji remplace, retirer efface', async () => {
    const reactions = async () =>
      (await activity('lea')).items.filter((n) => n.type === 'reaction');
    await call('dylan', 'PUT', `/api/v1/posts/${lea.id}/reaction`, { emoji: '❤️' });
    await call('dylan', 'PUT', `/api/v1/posts/${lea.id}/reaction`, { emoji: '😂' });
    expect(await reactions()).toEqual([
      expect.objectContaining({
        emoji: '😂',
        target: 'post',
        actor: expect.objectContaining({ displayName: 'Dylan' }),
      }),
    ]);
    await call('dylan', 'DELETE', `/api/v1/posts/${lea.id}/reaction`);
    expect(await reactions()).toEqual([]);

    // Réagir à son propre post ne notifie personne
    await call('lea', 'PUT', `/api/v1/posts/${lea.id}/reaction`, { emoji: '🔥' });
    expect(await reactions()).toEqual([]);
  });

  it('un commentaire prévient l’auteur, avec un extrait ; le supprimer efface', async () => {
    const long = 'Il a pleuré je vous jure, '.repeat(6);
    const comment = (
      await call('max', 'POST', `/api/v1/posts/${lea.id}/comments`, { body: long })
    ).json();
    const [n] = (await activity('lea')).items;
    expect(n).toMatchObject({ type: 'comment', actor: { displayName: 'Max' } });
    expect(n?.excerpt?.length).toBeLessThanOrEqual(80);
    expect(n?.excerpt?.endsWith('…')).toBe(true);

    await call('max', 'DELETE', `/api/v1/comments/${comment.id}`);
    expect((await activity('lea')).items.some((x) => x.type === 'comment')).toBe(false);
  });

  it('marquer comme lu, une par une ou tout', async () => {
    const page = await activity('dylan');
    expect(page.unread).toBe(3);
    const one = await call('dylan', 'POST', '/api/v1/notifications/read', {
      ids: [page.items[0]?.id],
    });
    expect(one.json()).toEqual({ unread: 2 });
    expect((await call('dylan', 'POST', '/api/v1/notifications/read', {})).json()).toEqual({
      unread: 0,
    });
    expect((await activity('dylan')).items.every((n) => n.read)).toBe(true);
    // Les notifications des autres ne bougent pas
    expect((await activity('max')).unread).toBeGreaterThan(0);
  });

  it('un post supprimé disparaît de l’activité', async () => {
    const extra = await post('max', [{ name: 'x.jpg', type: 'image/jpeg' }]);
    expect((await activity('lea')).items[0]?.postId).toBe(extra.id);
    await call('max', 'DELETE', `/api/v1/posts/${extra.id}`);
    expect((await activity('lea')).items.some((n) => n.postId === extra.id)).toBe(false);
  });

  it('préférences et événement coupé, propres à chacun', async () => {
    const me: Me = (
      await call('max', 'PATCH', '/api/v1/me', { notificationPrefs: { posts: false } })
    ).json();
    expect(me.notificationPrefs).toEqual({
      posts: false,
      reactions: true,
      comments: true,
      memories: true,
    });

    expect(
      (await call('dylan', 'PUT', `/api/v1/events/${event.id}/mute`, { muted: true })).json(),
    ).toEqual({ muted: true });
    const mine: EventSummary[] = (await call('dylan', 'GET', '/api/v1/events')).json();
    const theirs: EventSummary[] = (await call('lea', 'GET', '/api/v1/events')).json();
    expect(mine[0]?.muted).toBe(true);
    expect(theirs[0]?.muted).toBe(false);
    await call('dylan', 'PUT', `/api/v1/events/${event.id}/mute`, { muted: false });
  });

  it('abonnement push : https uniquement, un appareil change de compte', async () => {
    expect((await call('dylan', 'GET', '/api/v1/push/key')).statusCode).toBe(404);
    const keys = { p256dh: 'BEl6…', auth: 'k8J…' };
    const bad = await call('dylan', 'POST', '/api/v1/push/subscriptions', {
      endpoint: 'http://push.example.com/abc',
      keys,
    });
    expect(bad.statusCode).toBe(400);

    for (const who of ['max', 'dylan']) {
      const ok = await call(who, 'POST', '/api/v1/push/subscriptions', {
        endpoint: 'https://push.example.com/dylan-phone',
        keys,
      });
      expect(ok.statusCode).toBe(201);
    }
    await call('dylan', 'POST', '/api/v1/push/subscriptions', {
      endpoint: 'https://push.example.com/dylan-old-laptop',
      keys,
    });
    await call('max', 'POST', '/api/v1/push/subscriptions', {
      endpoint: 'https://push.example.com/max-phone',
      keys,
    });
    const rows = await t.database.db.select().from(pushSubscriptions);
    expect(rows.filter((r) => r.userId === ids.dylan)).toHaveLength(2);
    expect(rows.filter((r) => r.userId === ids.max)).toHaveLength(1);
  });

  it('push : une notification par salve, après le calme, selon les préférences', async () => {
    const sent: { endpoint: string; payload: { title: string; body: string } }[] = [];
    let now = new Date();
    const dispatcher = new PushDispatcher({
      db: t.database.db,
      log: t.app.log,
      now: () => now,
      send: async (target: PushTarget, payload: string) => {
        if (target.endpoint.endsWith('old-laptop')) return 'gone';
        sent.push({ endpoint: target.endpoint, payload: JSON.parse(payload) });
        return 'ok';
      },
    });

    // Tout ce qui précède est déjà ancien : on part d'une file vide
    now = new Date(Date.now() + 2 * 24 * 60 * MINUTE);
    await dispatcher.run();
    expect(sent).toEqual([]);

    // Léa envoie trois posts d'affilée
    for (const name of ['1.jpg', '2.jpg', '3.mov']) {
      await post('lea', [{ name, type: name.endsWith('mov') ? 'video/quicktime' : 'image/jpeg' }]);
    }
    now = new Date(Date.now() + 30_000);
    await dispatcher.run();
    expect(sent).toEqual([]); // pas encore 2 minutes de calme

    now = new Date(Date.now() + 3 * MINUTE);
    await dispatcher.run();
    // Dylan : une seule notification ; Max a coupé « La bande poste des photos »
    expect(sent).toEqual([
      {
        endpoint: 'https://push.example.com/dylan-phone',
        payload: expect.objectContaining({
          title: 'Week-end Bretagne',
          body: 'Léa a ajouté 2 photos et 1 vidéo',
        }),
      },
    ]);
    // L'appareil expiré est oublié
    const rows = await t.database.db
      .select()
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.userId, ids.dylan ?? ''));
    expect(rows.map((r) => r.endpoint)).toEqual(['https://push.example.com/dylan-phone']);

    // Rien n'est renvoyé au passage suivant
    await dispatcher.run();
    expect(sent).toHaveLength(1);

    // Événement coupé : l'activité reste, la notification push ne part pas
    await call('dylan', 'PUT', `/api/v1/events/${event.id}/mute`, { muted: true });
    await post('lea', [{ name: '4.jpg', type: 'image/jpeg' }]);
    now = new Date(Date.now() + 3 * MINUTE);
    await dispatcher.run();
    expect(sent).toHaveLength(1);
    expect((await activity('dylan')).items[0]?.type).toBe('post');
  });

  it('temps réel : le destinataire, et lui seul, est prévenu', async () => {
    const received: Record<string, unknown[]> = { lea: [], max: [] };
    const sockets = await Promise.all(
      (['lea', 'max'] as const).map(async (who) => {
        const ws = await t.app.injectWS('/api/v1/ws', {
          headers: { cookie: c[who] ?? '', origin: ORIGIN },
        });
        ws.on('message', (data: Buffer) => {
          const message = JSON.parse(data.toString());
          if (message.type === 'notification.created') received[who]?.push(message);
        });
        return ws;
      }),
    );
    await call('max', 'POST', `/api/v1/posts/${lea.id}/comments`, { body: 'Trop bien' });
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(received.lea).toEqual([{ type: 'notification.created' }]);
    expect(received.max).toEqual([]);
    for (const ws of sockets) ws.terminate();
  });
});
