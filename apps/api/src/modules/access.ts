import type { Role } from '@picturart/shared';
import { and, eq } from 'drizzle-orm';
import type { Db } from '../db/client.ts';
import { eventMembers } from '../db/schema.ts';
import { forbidden, notFound } from '../lib/errors.ts';

export async function getRole(db: Db, eventId: string, userId: string): Promise<Role | null> {
  const [row] = await db
    .select({ role: eventMembers.role })
    .from(eventMembers)
    .where(and(eq(eventMembers.eventId, eventId), eq(eventMembers.userId, userId)))
    .limit(1);
  return row?.role ?? null;
}

/**
 * Rôle de l'utilisateur dans l'événement.
 * Un non-membre reçoit un 404 : l'existence de l'événement ne lui est pas révélée.
 */
export async function requireMember(db: Db, eventId: string, userId: string, allowed?: Role[]) {
  const role = await getRole(db, eventId, userId);
  if (!role) throw notFound('Événement');
  if (allowed && !allowed.includes(role)) throw forbidden();
  return role;
}

export const isUuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
