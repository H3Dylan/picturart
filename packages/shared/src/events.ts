import { z } from 'zod';

export const ROLES = ['admin', 'contributor', 'viewer'] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  admin: 'Admin',
  contributor: 'Contributeur',
  viewer: 'Lecteur',
};

const isoDate = z.iso.date('Date invalide');

export const createEventSchema = z
  .object({
    name: z.string().trim().min(1, 'Donne un nom à l’événement').max(60, '60 caractères maximum'),
    startsOn: isoDate.optional(),
    endsOn: isoDate.optional(),
    location: z.string().trim().max(80, '80 caractères maximum').optional(),
  })
  .refine((e) => !e.startsOn || !e.endsOn || e.startsOn <= e.endsOn, {
    message: 'La fin doit être après le début',
    path: ['endsOn'],
  });
export type CreateEventInput = z.infer<typeof createEventSchema>;

export const updateEventSchema = z
  .object({
    name: z.string().trim().min(1, 'Donne un nom à l’événement').max(60, '60 caractères maximum'),
    startsOn: isoDate.nullable(),
    endsOn: isoDate.nullable(),
    location: z.string().trim().max(80, '80 caractères maximum').nullable(),
  })
  .partial();
export type UpdateEventInput = z.infer<typeof updateEventSchema>;

export const updateMemberSchema = z.object({ role: z.enum(ROLES) });

export interface Member {
  id: string;
  displayName: string;
  role: Role;
  joinedAt: string;
}

export interface EventDetail extends EventSummary {
  photoCount: number;
  postCount: number;
  members: Member[];
}

export interface EventSummary {
  id: string;
  name: string;
  startsOn: string | null;
  endsOn: string | null;
  location: string | null;
  role: Role;
  memberCount: number;
  createdAt: string;
}

export interface CreatedInvite {
  url: string;
  expiresAt: string;
  defaultRole: Role;
}

/** Aperçu public d'une invitation (avant inscription). */
export interface InvitePreview {
  event: {
    id: string;
    name: string;
    startsOn: string | null;
    endsOn: string | null;
    location: string | null;
    memberCount: number;
  };
  invitedBy: { displayName: string };
  /** true si l'utilisateur connecté est déjà membre. */
  alreadyMember: boolean;
}
