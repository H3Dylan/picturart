import { type InvitePreview, type Me, signupSchema } from '@picturart/shared';
import { and, count, eq, gt, isNull, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { hashPassword } from '../auth/password.ts';
import { setSessionCookie } from '../auth/plugin.ts';
import { createSession } from '../auth/sessions.ts';
import type { Config } from '../config.ts';
import type { Db } from '../db/client.ts';
import { eventMembers, events, invites, users } from '../db/schema.ts';
import { HttpError, parse } from '../lib/errors.ts';
import { sha256 } from '../lib/tokens.ts';
import { toMe } from './serializers.ts';

const invalidInvite = () =>
  new HttpError(
    404,
    'invite_invalid',
    'Ce lien d’invitation n’est plus valable. Demande-en un nouveau à la bande.',
  );

export function invitesRoutes(app: FastifyInstance, db: Db, config: Config) {
  async function findValidInvite(token: string) {
    const [invite] = await db
      .select()
      .from(invites)
      .where(
        and(
          eq(invites.tokenHash, sha256(token)),
          isNull(invites.revokedAt),
          gt(invites.expiresAt, new Date()),
        ),
      )
      .limit(1);
    if (!invite) throw invalidInvite();
    return invite;
  }

  async function isMember(eventId: string, userId: string) {
    const [row] = await db
      .select({ userId: eventMembers.userId })
      .from(eventMembers)
      .where(and(eq(eventMembers.eventId, eventId), eq(eventMembers.userId, userId)))
      .limit(1);
    return Boolean(row);
  }

  app.get<{ Params: { token: string } }>(
    '/api/v1/invites/:token',
    { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    async (request) => {
      const invite = await findValidInvite(request.params.token);
      const [event] = await db.select().from(events).where(eq(events.id, invite.eventId)).limit(1);
      const [inviter] = await db
        .select({ displayName: users.displayName })
        .from(users)
        .where(eq(users.id, invite.createdBy))
        .limit(1);
      const [members] = await db
        .select({ total: count() })
        .from(eventMembers)
        .where(eq(eventMembers.eventId, invite.eventId));
      if (!event || !inviter) throw invalidInvite();

      const preview: InvitePreview = {
        event: {
          id: event.id,
          name: event.name,
          startsOn: event.startsOn,
          endsOn: event.endsOn,
          location: event.location,
          memberCount: Number(members?.total ?? 0),
        },
        invitedBy: { displayName: inviter.displayName },
        alreadyMember: request.user ? await isMember(event.id, request.user.id) : false,
      };
      return preview;
    },
  );

  /**
   * Rejoindre l'événement :
   * - connecté : ajout comme membre ;
   * - sinon : création du compte (prénom, e-mail, mot de passe), ajout et connexion.
   */
  app.post<{ Params: { token: string } }>(
    '/api/v1/invites/:token/accept',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const invite = await findValidInvite(request.params.token);
      let me: Me | null = null;
      let userId = request.user?.id;

      if (!userId) {
        const input = parse(signupSchema, request.body);
        const [existing] = await db
          .select({ id: users.id })
          .from(users)
          .where(eq(users.email, input.email))
          .limit(1);
        if (existing) {
          throw new HttpError(409, 'email_taken', 'Un compte existe déjà avec cet e-mail.', {
            email:
              'Un compte existe déjà avec cet e-mail : connecte-toi pour rejoindre l’événement.',
          });
        }
        const [user] = await db
          .insert(users)
          .values({
            displayName: input.displayName,
            email: input.email,
            passwordHash: await hashPassword(input.password),
          })
          .returning();
        if (!user) throw new Error('Création du compte impossible');
        userId = user.id;
        me = toMe(user);
        const token = await createSession(
          db,
          user.id,
          config.SESSION_DAYS,
          request.headers['user-agent'],
        );
        setSessionCookie(reply, config, token);
      }

      const joined = await db
        .insert(eventMembers)
        .values({ eventId: invite.eventId, userId, role: invite.defaultRole })
        .onConflictDoNothing()
        .returning({ userId: eventMembers.userId });
      if (joined.length > 0) {
        await db
          .update(invites)
          .set({ useCount: sql`${invites.useCount} + 1` })
          .where(eq(invites.id, invite.id));
      }

      return { eventId: invite.eventId, me: me ?? (request.user ? toMe(request.user) : null) };
    },
  );
}
