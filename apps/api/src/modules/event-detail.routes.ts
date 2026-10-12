import {
  type EventDetail,
  type Member,
  muteEventSchema,
  updateEventSchema,
  updateMemberSchema,
} from '@picturart/shared';
import { and, asc, count, eq, isNull, ne } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { requireUser } from '../auth/plugin.ts';
import type { Db } from '../db/client.ts';
import { eventMembers, events, media, posts, users } from '../db/schema.ts';
import { forbidden, HttpError, notFound, parse } from '../lib/errors.ts';
import { isUuid, requireMember } from './access.ts';

const lastAdmin = () =>
  new HttpError(
    409,
    'validation',
    'Il faut au moins un admin : nomme quelqu’un d’autre admin avant de partir.',
  );

export function eventDetailRoutes(app: FastifyInstance, db: Db) {
  async function isMuted(eventId: string, userId: string) {
    const [row] = await db
      .select({ muted: eventMembers.muted })
      .from(eventMembers)
      .where(and(eq(eventMembers.eventId, eventId), eq(eventMembers.userId, userId)))
      .limit(1);
    return row?.muted;
  }

  async function adminCount(eventId: string) {
    const [row] = await db
      .select({ total: count() })
      .from(eventMembers)
      .where(and(eq(eventMembers.eventId, eventId), eq(eventMembers.role, 'admin')));
    return Number(row?.total ?? 0);
  }

  async function loadDetail(eventId: string, userId: string): Promise<EventDetail> {
    const role = await requireMember(db, eventId, userId);
    const [event] = await db
      .select()
      .from(events)
      .where(and(eq(events.id, eventId), isNull(events.archivedAt)))
      .limit(1);
    if (!event) throw notFound('Événement');

    const memberRows = await db
      .select({
        id: users.id,
        displayName: users.displayName,
        role: eventMembers.role,
        joinedAt: eventMembers.joinedAt,
      })
      .from(eventMembers)
      .innerJoin(users, eq(users.id, eventMembers.userId))
      .where(eq(eventMembers.eventId, eventId))
      .orderBy(asc(eventMembers.joinedAt));
    const members: Member[] = memberRows.map((m) => ({ ...m, joinedAt: m.joinedAt.toISOString() }));

    const [postStats] = await db
      .select({ total: count() })
      .from(posts)
      .where(and(eq(posts.eventId, eventId), isNull(posts.deletedAt)));
    const [photoStats] = await db
      .select({ total: count() })
      .from(media)
      .innerJoin(posts, eq(posts.id, media.postId))
      .where(and(eq(posts.eventId, eventId), isNull(posts.deletedAt), eq(media.status, 'ready')));

    return {
      id: event.id,
      name: event.name,
      startsOn: event.startsOn,
      endsOn: event.endsOn,
      location: event.location,
      role,
      memberCount: members.length,
      muted: (await isMuted(eventId, userId)) ?? false,
      createdAt: event.createdAt.toISOString(),
      members,
      postCount: Number(postStats?.total ?? 0),
      photoCount: Number(photoStats?.total ?? 0),
    };
  }

  app.get<{ Params: { id: string } }>('/api/v1/events/:id', async (request) => {
    const user = requireUser(request);
    if (!isUuid(request.params.id)) throw notFound('Événement');
    return loadDetail(request.params.id, user.id);
  });

  app.patch<{ Params: { id: string } }>('/api/v1/events/:id', async (request) => {
    const user = requireUser(request);
    if (!isUuid(request.params.id)) throw notFound('Événement');
    await requireMember(db, request.params.id, user.id, ['admin']);
    const changes = parse(updateEventSchema, request.body);
    if (Object.keys(changes).length > 0) {
      await db.update(events).set(changes).where(eq(events.id, request.params.id));
    }
    return loadDetail(request.params.id, user.id);
  });

  /** Couper (ou rétablir) les notifications push d'un événement, pour soi. */
  app.put<{ Params: { id: string } }>('/api/v1/events/:id/mute', async (request) => {
    const user = requireUser(request);
    if (!isUuid(request.params.id)) throw notFound('Événement');
    await requireMember(db, request.params.id, user.id);
    const { muted } = parse(muteEventSchema, request.body);
    await db
      .update(eventMembers)
      .set({ muted })
      .where(and(eq(eventMembers.eventId, request.params.id), eq(eventMembers.userId, user.id)));
    return { muted };
  });

  /** Changer le rôle d'un membre (admins uniquement). */
  app.patch<{ Params: { id: string; userId: string } }>(
    '/api/v1/events/:id/members/:userId',
    async (request) => {
      const user = requireUser(request);
      const { id, userId } = request.params;
      if (!isUuid(id) || !isUuid(userId)) throw notFound('Membre');
      await requireMember(db, id, user.id, ['admin']);
      const { role } = parse(updateMemberSchema, request.body);

      const current = await requireMember(db, id, userId).catch(() => {
        throw notFound('Membre');
      });
      if (current === 'admin' && role !== 'admin' && (await adminCount(id)) <= 1) throw lastAdmin();

      await db
        .update(eventMembers)
        .set({ role })
        .where(and(eq(eventMembers.eventId, id), eq(eventMembers.userId, userId)));
      return loadDetail(id, user.id);
    },
  );

  /** Quitter l'événement (soi-même) ou retirer un membre (admins). Ses photos restent. */
  app.delete<{ Params: { id: string; userId: string } }>(
    '/api/v1/events/:id/members/:userId',
    async (request, reply) => {
      const user = requireUser(request);
      const { id, userId } = request.params;
      if (!isUuid(id) || !isUuid(userId)) throw notFound('Membre');
      const myRole = await requireMember(db, id, user.id);
      if (userId !== user.id && myRole !== 'admin') throw forbidden();

      const targetRole = await requireMember(db, id, userId).catch(() => {
        throw notFound('Membre');
      });
      if (targetRole === 'admin') {
        const others = await db
          .select({ total: count() })
          .from(eventMembers)
          .where(
            and(
              eq(eventMembers.eventId, id),
              eq(eventMembers.role, 'admin'),
              ne(eventMembers.userId, userId),
            ),
          );
        if (Number(others[0]?.total ?? 0) === 0) throw lastAdmin();
      }

      await db
        .delete(eventMembers)
        .where(and(eq(eventMembers.eventId, id), eq(eventMembers.userId, userId)));
      return reply.code(204).send();
    },
  );
}
