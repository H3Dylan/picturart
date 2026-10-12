import { z } from 'zod';

/** Formats acceptés à l'envoi (photos). Les vidéos et le HEIC natif arrivent au jalon M4. */
export const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const MAX_FILE_BYTES = 4 * 1024 ** 3; // 4 Go
export const MAX_FILES_PER_POST = 50;

export const MEDIA_STATUSES = ['uploading', 'processing', 'ready', 'failed'] as const;
export type MediaStatus = (typeof MEDIA_STATUSES)[number];

export const MEDIA_VARIANTS = ['thumb', 'display', 'original'] as const;
export type MediaVariant = (typeof MEDIA_VARIANTS)[number];

export const createPostSchema = z.object({
  eventId: z.uuid(),
  caption: z.string().trim().max(500, '500 caractères maximum').default(''),
  files: z
    .array(
      z.object({
        name: z.string().max(255),
        size: z.number().int().positive().max(MAX_FILE_BYTES, 'Fichier trop lourd (4 Go maximum)'),
        type: z.enum(ACCEPTED_IMAGE_TYPES, 'Format non pris en charge pour l’instant'),
      }),
    )
    .min(1, 'Choisis au moins une photo')
    .max(MAX_FILES_PER_POST, `${MAX_FILES_PER_POST} photos maximum par post`),
});
export type CreatePostInput = z.input<typeof createPostSchema>;

export interface MediaDto {
  id: string;
  kind: 'photo';
  status: MediaStatus;
  width: number | null;
  height: number | null;
  takenAt: string | null;
  position: number;
}

export interface PostDto {
  id: string;
  eventId: string;
  author: { id: string; displayName: string };
  caption: string;
  createdAt: string;
  media: MediaDto[];
}

export interface PostsPage {
  posts: PostDto[];
  /** Curseur de la page suivante, ou null en fin de liste. */
  nextCursor: string | null;
}

/** URL d'une variante (vignette, affichage, original) servie aux seuls membres. */
export const mediaUrl = (mediaId: string, variant: MediaVariant) =>
  `/api/v1/media/${mediaId}/${variant}`;
