import { z } from 'zod';
import type { CommentDto, Reactions } from './social.ts';

/** Formats acceptés à l'envoi : photos (HEIC d'iPhone compris) et vidéos. */
export const ACCEPTED_IMAGE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
] as const;
export const ACCEPTED_VIDEO_TYPES = ['video/mp4', 'video/quicktime'] as const;
export const ACCEPTED_MEDIA_TYPES = [...ACCEPTED_IMAGE_TYPES, ...ACCEPTED_VIDEO_TYPES] as const;
export type AcceptedMediaType = (typeof ACCEPTED_MEDIA_TYPES)[number];
export const MAX_FILE_BYTES = 4 * 1024 ** 3; // 4 Go
export const MAX_FILES_PER_POST = 50;

/** Type MIME d'un fichier, déduit de l'extension quand le navigateur ne le donne pas (HEIC sous Windows ou Android). */
export function mediaTypeOf(file: { name: string; type: string }): AcceptedMediaType | null {
  const declared = file.type.toLowerCase();
  if ((ACCEPTED_MEDIA_TYPES as readonly string[]).includes(declared)) {
    return declared as AcceptedMediaType;
  }
  const extension = file.name.toLowerCase().split('.').pop() ?? '';
  const byExtension: Record<string, AcceptedMediaType> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
    heic: 'image/heic',
    heif: 'image/heif',
    mp4: 'video/mp4',
    m4v: 'video/mp4',
    mov: 'video/quicktime',
  };
  return byExtension[extension] ?? null;
}

export const MEDIA_KINDS = ['photo', 'video'] as const;
export type MediaKind = (typeof MEDIA_KINDS)[number];

export const MEDIA_STATUSES = ['uploading', 'processing', 'ready', 'failed'] as const;
export type MediaStatus = (typeof MEDIA_STATUSES)[number];

/** `video` : version de lecture MP4 ; pour une vidéo, `thumb` et `display` sont des images d'aperçu. */
export const MEDIA_VARIANTS = ['thumb', 'display', 'video', 'original'] as const;
export type MediaVariant = (typeof MEDIA_VARIANTS)[number];

export const createPostSchema = z.object({
  eventId: z.uuid(),
  caption: z.string().trim().max(500, '500 caractères maximum').default(''),
  files: z
    .array(
      z.object({
        name: z.string().max(255),
        size: z.number().int().positive().max(MAX_FILE_BYTES, 'Fichier trop lourd (4 Go maximum)'),
        type: z.enum(ACCEPTED_MEDIA_TYPES, 'Format non pris en charge'),
      }),
    )
    .min(1, 'Choisis au moins une photo ou une vidéo')
    .max(MAX_FILES_PER_POST, `${MAX_FILES_PER_POST} fichiers maximum par post`),
});
export type CreatePostInput = z.input<typeof createPostSchema>;

export interface MediaDto {
  id: string;
  kind: MediaKind;
  status: MediaStatus;
  /** Dimensions d'affichage (rotation appliquée). */
  width: number | null;
  height: number | null;
  /** Durée des vidéos, en millisecondes. */
  durationMs: number | null;
  takenAt: string | null;
  position: number;
  reactions: Reactions;
}

export interface PostDto {
  id: string;
  eventId: string;
  event: { id: string; name: string };
  author: { id: string; displayName: string };
  caption: string;
  createdAt: string;
  media: MediaDto[];
  reactions: Reactions;
  commentCount: number;
  lastComment: CommentDto | null;
}

export interface PostsPage {
  posts: PostDto[];
  /** Curseur de la page suivante, ou null en fin de liste. */
  nextCursor: string | null;
}

/** URL d'une variante (vignette, affichage, original) servie aux seuls membres. */
export const mediaUrl = (mediaId: string, variant: MediaVariant) =>
  `/api/v1/media/${mediaId}/${variant}`;
