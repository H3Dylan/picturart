import type { CreatedInvite, EventSummary, InvitePreview } from '@picturart/shared';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eventMembers } from '../src/db/schema.ts';
import { createTestApp, ORIGIN, sessionCookie } from './helpers.ts';

describe('événements et invitations', () => {
  let t: Awaited<ReturnType<typeof createTestApp>>;
  let dylan: string;
  let event: EventSummary;
  let token: string;

  beforeAll(async () => {
    t = await createTestApp();
    await t.createUser('Dylan', 'dylan@exemple.fr');
    dylan = await t.login('dylan@exemple.fr');
  });
  afterAll(() => t.close());

  it('crée un événement dont le créateur est admin', async () => {
    const response = await t.app.inject({
      method: 'POST',
      url: '/api/v1/events',
      headers: { cookie: dylan, origin: ORIGIN },
      payload: { name: 'Week-end Bretagne', startsOn: '2026-07-12', endsOn: '2026-07-14' },
    });
    expect(response.statusCode).toBe(201);
    event = response.json();
    expect(event).toMatchObject({ name: 'Week-end Bretagne', role: 'admin', memberCount: 1 });
  });

  it('valide les champs (dates dans le désordre)', async () => {
    const response = await t.app.inject({
      method: 'POST',
      url: '/api/v1/events',
      headers: { cookie: dylan, origin: ORIGIN },
      payload: { name: 'Ski', startsOn: '2027-02-15', endsOn: '2027-02-08' },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.fields).toHaveProperty('endsOn');
  });

  it('génère un lien d’invitation', async () => {
    const response = await t.app.inject({
      method: 'POST',
      url: `/api/v1/events/${event.id}/invites`,
      headers: { cookie: dylan, origin: ORIGIN },
    });
    expect(response.statusCode).toBe(201);
    const invite: CreatedInvite = response.json();
    expect(invite.url).toMatch(new RegExp(`^${ORIGIN}/i/[A-Za-z0-9_-]{22}$`));
    token = invite.url.split('/i/')[1] ?? '';
  });

  it('montre un aperçu public de l’invitation', async () => {
    const response = await t.app.inject({ method: 'GET', url: `/api/v1/invites/${token}` });
    const preview: InvitePreview = response.json();
    expect(preview).toMatchObject({
      event: { name: 'Week-end Bretagne', memberCount: 1 },
      invitedBy: { displayName: 'Dylan' },
      alreadyMember: false,
    });
  });

  it('inscrit un nouveau pote et l’ajoute comme contributeur', async () => {
    const response = await t.app.inject({
      method: 'POST',
      url: `/api/v1/invites/${token}/accept`,
      headers: { origin: ORIGIN },
      payload: { displayName: 'Léa', email: 'Lea@Exemple.fr', password: 'unbonmotdepasse' },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ eventId: event.id, me: { displayName: 'Léa' } });

    const lea = sessionCookie(response);
    const events = await t.app.inject({
      method: 'GET',
      url: '/api/v1/events',
      headers: { cookie: lea },
    });
    expect(events.json()).toEqual([
      expect.objectContaining({ id: event.id, role: 'contributor', memberCount: 2 }),
    ]);
  });

  it('refuse une deuxième inscription avec le même e-mail', async () => {
    const response = await t.app.inject({
      method: 'POST',
      url: `/api/v1/invites/${token}/accept`,
      headers: { origin: ORIGIN },
      payload: { displayName: 'Léa bis', email: 'lea@exemple.fr', password: 'unbonmotdepasse' },
    });
    expect(response.statusCode).toBe(409);
    expect(response.json().error.fields).toHaveProperty('email');
  });

  it('refuse un mot de passe trop court', async () => {
    const response = await t.app.inject({
      method: 'POST',
      url: `/api/v1/invites/${token}/accept`,
      headers: { origin: ORIGIN },
      payload: { displayName: 'Max', email: 'max@exemple.fr', password: 'court' },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.fields).toHaveProperty('password');
  });

  it('rejette un lien inconnu', async () => {
    const response = await t.app.inject({ method: 'GET', url: '/api/v1/invites/inexistant' });
    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe('invite_invalid');
  });

  it('interdit à un lecteur de créer des invitations', async () => {
    await t.createUser('Max', 'max@exemple.fr');
    const max = await t.login('max@exemple.fr');
    await t.app.inject({
      method: 'POST',
      url: `/api/v1/invites/${token}/accept`,
      headers: { cookie: max, origin: ORIGIN },
    });
    const { db } = t.database;
    const maxRow = await t.app.inject({
      method: 'GET',
      url: '/api/v1/me',
      headers: { cookie: max },
    });
    await db
      .update(eventMembers)
      .set({ role: 'viewer' })
      .where(and(eq(eventMembers.eventId, event.id), eq(eventMembers.userId, maxRow.json().id)));

    const response = await t.app.inject({
      method: 'POST',
      url: `/api/v1/events/${event.id}/invites`,
      headers: { cookie: max, origin: ORIGIN },
    });
    expect(response.statusCode).toBe(403);
  });

  it('cache les événements dont on n’est pas membre', async () => {
    await t.createUser('Intrus', 'intrus@exemple.fr');
    const intrus = await t.login('intrus@exemple.fr');
    const response = await t.app.inject({
      method: 'POST',
      url: `/api/v1/events/${event.id}/invites`,
      headers: { cookie: intrus, origin: ORIGIN },
    });
    expect(response.statusCode).toBe(404);
  });
});
