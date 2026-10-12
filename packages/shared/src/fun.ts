import { z } from 'zod';
import type { MediaKind } from './posts.ts';
import type { CustomReactionKey, ReactionKey } from './social.ts';

// ---- Réactions perso -------------------------------------------------------------------
export const MAX_CUSTOM_REACTIONS_PER_USER = 30;

export interface CustomReactionDto {
  id: string;
  key: CustomReactionKey;
  name: string;
  createdBy: { id: string; displayName: string };
  createdAt: string;
  /** Nombre de fois où elle a servi (posts et photos). */
  uses: number;
}

/** Recadrage carré, en fractions de l'image affichée (0 à 1). */
export const createCustomReactionSchema = z
  .object({
    mediaId: z.uuid(),
    name: z.string().trim().min(1, 'Donne-lui un nom').max(24, '24 caractères maximum'),
    crop: z.object({
      x: z.number().min(0).max(1),
      y: z.number().min(0).max(1),
      width: z.number().min(0.02).max(1),
      height: z.number().min(0.02).max(1),
    }),
  })
  .refine((v) => v.crop.x + v.crop.width <= 1.001 && v.crop.y + v.crop.height <= 1.001, {
    message: 'Recadrage hors de la photo',
    path: ['crop'],
  });
export type CreateCustomReactionInput = z.input<typeof createCustomReactionSchema>;

export const customReactionImageUrl = (id: string) => `/api/v1/custom-reactions/${id}/image`;

// ---- Souvenirs -------------------------------------------------------------------------
/** « Il y a 1 an aujourd'hui » : une journée passée d'un événement. */
export interface MemoryDto {
  eventId: string;
  eventName: string;
  /** Jour du souvenir (AAAA-MM-JJ, heure de Paris). */
  date: string;
  yearsAgo: number;
  /** La photo la plus aimée de la journée. */
  mediaId: string;
  photos: number;
  videos: number;
}

export function memoryLabel(yearsAgo: number) {
  return `Il y a ${yearsAgo} an${yearsAgo > 1 ? 's' : ''}`;
}

// ---- Profils ---------------------------------------------------------------------------
export interface ProfileDto {
  id: string;
  displayName: string;
  bio: string;
  memberSince: string;
  /** Calculées sur les événements qu'on partage (tous les siens pour son propre profil). */
  stats: {
    posts: number;
    reactionsReceived: number;
    topReaction: ReactionKey | null;
  };
  commonEvents: { id: string; name: string }[];
}

export interface ProfileMediaItem {
  mediaId: string;
  postId: string;
  eventId: string;
  kind: MediaKind;
  durationMs: number | null;
  /** Prise de vue, sinon publication : sert au tampon de date. */
  date: string;
}

export interface ProfileMediaPage {
  items: ProfileMediaItem[];
  nextCursor: string | null;
}
