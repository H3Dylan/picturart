import { type CreatedInvite, createEventSchema, type EventSummary } from '@picturart/shared';
import { and, count, desc, eq, isNull } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { requireUser } from '../auth/plugin.ts';
import type { Config } from '../config.ts';
import type { Db } from '../db/client.ts';
import { eventMembers, events, invites } from '../db/schema.ts';
import { forbidden, notFound, parse } from '../lib/errors.ts';
import { randomToken, sha256 } from '../lib/tokens.ts';

const INVITE_DAYS = 7;

export function eventsRoutes(app: FastifyInstance, db: Db, config: Config) {
  const memberCounts = db
    .select({ eventId: eventMembers.eventId, total: count().as('total') })
    .from(eventMembers)
    .groupBy(eventMembers.eventId)
    .as('member_counts');

  async function listEvents(userId: string, eventId?: string): Promise<EventSummary[]> {
    const rows = await db
      .select({
        event: events,
        role: eventMembers.role,
        muted: eventMembers.muted,
        memberCount: memberCounts.total,
      })
      .from(eventMembers)
      .innerJoin(events, eq(events.id, eventMembers.eventId))
      .innerJoin(memberCounts, eq(memberCounts.eventId, events.id))
      .where(
        and(
          eq(eventMembers.userId, userId),
          isNull(events.archivedAt),
          eventId ? eq(events.id, eventId) : undefined,
        ),
      )
      .orderBy(desc(events.createdAt));

    return rows.map(({ event, role, muted, memberCount }) => ({
      id: event.id,
      name: event.name,
      startsOn: event.startsOn,
      endsOn: event.endsOn,
      location: event.location,
      role,
      memberCount: Number(memberCount),
      muted,
      createdAt: event.createdAt.toISOString(),
    }));
  }

  app.get('/api/v1/events', async (request) => listEvents(requireUser(request).id));

  app.post('/api/v1/events', async (request, reply) => {
    const user = requireUser(request);
    const input = parse(createEventSchema, request.body);

    const eventId = await db.transaction(async (tx) => {
      const [event] = await tx
        .insert(events)
        .values({
          name: input.name,
          startsOn: input.startsOn ?? null,
          endsOn: input.endsOn ?? null,
          location: input.location || null,
          createdBy: user.id,
        })
        .returning({ id: events.id });
      if (!event) throw new Error('Création de l’événement impossible');
      await tx.insert(eventMembers).values({ eventId: event.id, userId: user.id, role: 'admin' });
      return event.id;
    });

    const [created] = await listEvents(user.id, eventId);
    return reply.code(201).send(created);
  });

  app.post<{ Params: { id: string } }>('/api/v1/events/:id/invites', async (request, reply) => {
    const user = requireUser(request);
    const [membership] = await db
      .select({ role: eventMembers.role })
      .from(eventMembers)
      .where(and(eq(eventMembers.eventId, request.params.id), eq(eventMembers.userId, user.id)))
      .limit(1);
    if (!membership) throw notFound('Événement');
    if (membership.role === 'viewer') throw forbidden();

    const token = randomToken();
    const expiresAt = new Date(Date.now() + INVITE_DAYS * 24 * 60 * 60 * 1000);
    await db.insert(invites).values({
      eventId: request.params.id,
      tokenHash: sha256(token),
      createdBy: user.id,
      expiresAt,
    });

    const body: CreatedInvite = {
      url: `${config.APP_ORIGIN}/i/${token}`,
      expiresAt: expiresAt.toISOString(),
      defaultRole: 'contributor',
    };
    return reply.code(201).send(body);
  });
}
