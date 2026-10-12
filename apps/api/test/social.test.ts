import type {
  CommentDto,
  CreatedInvite,
  EventSummary,
  PlancheItem,
  PostDto,
  PostsPage,
  RealtimeMessage,
} from '@picturart/shared';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { media } from '../src/db/schema.ts';
import { createTestApp, ORIGIN, sessionCookie } from './helpers.ts';

describe('social : fil, réactions, commentaires, planche, temps réel', () => {
  let t: Awaited<ReturnType<typeof createTestApp>>;
  const c: Record<string, string> = {};
  let event: EventSummary;
  let post: PostDto;

  const call = (who: string, method: string, url: string, payload?: object) =>
    t.app.inject({
      method: method as 'GET',
      url,
      headers: { cookie: c[who] ?? '', origin: ORIGIN },
      ...(payload && { payload }),
    });

  /** Post de 2 photos, marquées « prêtes » directement en base (l'envoi est testé ailleurs). */
  async function readyPost(who: string, eventId: string, caption: string): Promise<PostDto> {
    const created: PostDto = (
      await call(who, 'POST', '/api/v1/posts', {
        eventId,
        caption,
        files: [
          { name: 'a.jpg', size: 10, type: 'image/jpeg' },
          { name: 'b.jpg', size: 10, type: 'image/jpeg' },
        ],
      })
    ).json();
    for (const [i, m] of created.media.entries()) {
      await t.database.db
        .update(media)
        .set({ status: 'ready', width: 4000, height: 3000, takenAt: new Date(2026, 6, 13, 10 + i) })
        .where(eq(media.id, m.id));
    }
    return (await call(who, 'GET', `/api/v1/posts/${created.id}`)).json();
  }

  beforeAll(async () => {
    t = await createTestApp();
    await t.createUser('Dylan', 'dylan@exemple.fr');
    await t.createUser('Intrus', 'intrus@exemple.fr');
    c.dylan = await t.login('dylan@exemple.fr');
    c.intrus = await t.login('intrus@exemple.fr');
    event = (await call('dylan', 'POST', '/api/v1/events', { name: 'Bretagne' })).json();
    const invite: CreatedInvite = (
      await call('dylan', 'POST', `/api/v1/events/${event.id}/invites`)
    ).json();
    const joined = await t.app.inject({
      method: 'POST',
      url: `/api/v1/invites/${invite.url.split('/i/')[1]}/accept`,
      headers: { origin: ORIGIN },
      payload: { displayName: 'Léa', email: 'lea@exemple.fr', password: 'unbonmotdepasse' },
    });
    c.lea = sessionCookie(joined);
    post = await readyPost('lea', event.id, 'La plage');
  });
  afterAll(() => t.close());

  describe('réactions sur un post', () => {
    it('plusieurs réactions par personne, chaque emoji une fois, retirées une à une', async () => {
      const put = (who: string, emoji: string) =>
        call(who, 'PUT', `/api/v1/posts/${post.id}/reaction`, { emoji });
      let r = (await put('lea', '❤️')).json();
      expect(r).toEqual({ counts: [{ emoji: '❤️', count: 1 }], mine: ['❤️'] });

      // Léa ajoute 😂 en plus, Dylan aussi ; reposer ❤️ ne double rien
      await put('lea', '😂');
      await put('lea', '❤️');
      r = (await put('dylan', '😂')).json();
      expect(r.counts).toEqual([
        { emoji: '😂', count: 2 },
        { emoji: '❤️', count: 1 },
      ]);
      expect(r.mine).toEqual(['😂']);

      // Retirer ❤️ garde 😂
      r = (await call('lea', 'DELETE', `/api/v1/posts/${post.id}/reaction`, { emoji: '❤️' })).json();
      expect(r).toEqual({ counts: [{ emoji: '😂', count: 2 }], mine: ['😂'] });
    });

    it('tous les emojis, sous leur forme officielle', async () => {
      const put = (emoji: string) =>
        call('lea', 'PUT', `/api/v1/posts/${post.id}/reaction`, { emoji });
      // 👍️ (sélecteur de présentation en trop) et 👍 donnent la même réaction
      await put('👍️');
      const r = (await put('👍')).json();
      expect(r.counts).toContainEqual({ emoji: '👍', count: 1 });
      expect(r.mine.filter((e: string) => e.startsWith('👍'))).toEqual(['👍']);
      // Couleur de peau et drapeau
      expect((await put('🫶🏽')).json().mine).toContain('🫶🏽');
      expect((await put('🇫🇷')).statusCode).toBe(200);
      for (const emoji of ['👍', '🫶🏽', '🇫🇷']) {
        await call('lea', 'DELETE', `/api/v1/posts/${post.id}/reaction`, { emoji });
      }
    });

    it('refuse ce qui n’est pas un emoji, et les non-membres', async () => {
      for (const emoji of ['lol', '😂😂', '', '<b>']) {
        const bad = await call('lea', 'PUT', `/api/v1/posts/${post.id}/reaction`, { emoji });
        expect(bad.statusCode).toBe(400);
      }
      const intrus = await call('intrus', 'PUT', `/api/v1/posts/${post.id}/reaction`, {
        emoji: '❤️',
      });
      expect(intrus.statusCode).toBe(404);
    });
  });

  it('réagit à une photo précise', async () => {
    const mediaId = post.media[1]?.id;
    const r = (
      await call('dylan', 'PUT', `/api/v1/media/${mediaId}/reaction`, { emoji: '🔥' })
    ).json();
    expect(r).toEqual({ counts: [{ emoji: '🔥', count: 1 }], mine: ['🔥'] });
    const reloaded: PostDto = (await call('lea', 'GET', `/api/v1/posts/${post.id}`)).json();
    expect(reloaded.media[1]?.reactions).toEqual({
      counts: [{ emoji: '🔥', count: 1 }],
      mine: [],
    });
  });

  describe('commentaires', () => {
    let comment: CommentDto;

    it('commente et affiche le dernier commentaire dans le post', async () => {
      const response = await call('dylan', 'POST', `/api/v1/posts/${post.id}/comments`, {
        body: 'Il a pleuré je vous jure',
      });
      expect(response.statusCode).toBe(201);
      comment = response.json();
      const reloaded: PostDto = (await call('lea', 'GET', `/api/v1/posts/${post.id}`)).json();
      expect(reloaded.commentCount).toBe(1);
      expect(reloaded.lastComment).toMatchObject({
        body: 'Il a pleuré je vous jure',
        author: { displayName: 'Dylan' },
      });
    });

    it('refuse un commentaire vide', async () => {
      const response = await call('lea', 'POST', `/api/v1/posts/${post.id}/comments`, {
        body: '  ',
      });
      expect(response.statusCode).toBe(400);
    });

    it('seul l’auteur supprime son commentaire', async () => {
      expect((await call('lea', 'DELETE', `/api/v1/comments/${comment.id}`)).statusCode).toBe(403);
      expect((await call('dylan', 'DELETE', `/api/v1/comments/${comment.id}`)).statusCode).toBe(
        204,
      );
      const list: CommentDto[] = (
        await call('lea', 'GET', `/api/v1/posts/${post.id}/comments`)
      ).json();
      expect(list).toEqual([]);
    });
  });

  it('le fil regroupe les posts de mes événements, et seulement eux', async () => {
    const other: EventSummary = (
      await call('intrus', 'POST', '/api/v1/events', { name: 'Secret' })
    ).json();
    await readyPost('intrus', other.id, 'Pas pour vous');

    const feed: PostsPage = (await call('dylan', 'GET', '/api/v1/feed')).json();
    expect(feed.posts.map((p) => p.caption)).toEqual(['La plage']);
    expect(feed.posts[0]?.event).toEqual({ id: event.id, name: 'Bretagne' });

    const intrusFeed: PostsPage = (await call('intrus', 'GET', '/api/v1/feed')).json();
    expect(intrusFeed.posts.map((p) => p.caption)).toEqual(['Pas pour vous']);
  });

  it('la planche contact classe les photos par date de prise de vue, les meilleures par réactions', async () => {
    const planche: PlancheItem[] = (
      await call('lea', 'GET', `/api/v1/events/${event.id}/media`)
    ).json();
    expect(planche.map((p) => p.mediaId)).toEqual(post.media.map((m) => m.id));

    const best: PlancheItem[] = (
      await call('lea', 'GET', `/api/v1/events/${event.id}/media?tri=meilleures`)
    ).json();
    expect(best).toEqual([
      expect.objectContaining({ mediaId: post.media[1]?.id, reactionCount: 1 }),
    ]);
  });

  describe('temps réel', () => {
    it('prévient les membres, et seulement eux', async () => {
      await t.app.ready();
      const received: Record<string, RealtimeMessage[]> = { dylan: [], intrus: [] };
      const sockets = await Promise.all(
        (['dylan', 'intrus'] as const).map(async (who) => {
          const ws = await t.app.injectWS('/api/v1/ws', {
            headers: { cookie: c[who] ?? '', origin: ORIGIN },
          });
          ws.on('message', (data: Buffer) => {
            const message = JSON.parse(data.toString());
            if (message.type !== 'hello') received[who]?.push(message);
          });
          return ws;
        }),
      );

      await call('lea', 'PUT', `/api/v1/posts/${post.id}/reaction`, { emoji: '👏' });
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(received.dylan).toEqual([
        { type: 'reaction.updated', eventId: event.id, postId: post.id },
      ]);
      expect(received.intrus).toEqual([]);
      for (const ws of sockets) ws.terminate();
    });

    it('ferme une connexion sans session', async () => {
      const ws = await t.app.injectWS('/api/v1/ws', { headers: { origin: ORIGIN } });
      const code = await new Promise((resolve) => ws.on('close', resolve));
      expect(code).toBe(4401);
    });
  });
});
