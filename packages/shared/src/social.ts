import { z } from 'zod';

/** Réactions disponibles (les réactions perso de la bande arrivent au jalon M6). */
export const REACTION_EMOJIS = ['❤️', '😂', '🔥', '😍', '😮', '👏'] as const;
export type ReactionEmoji = (typeof REACTION_EMOJIS)[number];

export const reactionSchema = z.object({ emoji: z.enum(REACTION_EMOJIS) });

export const commentSchema = z.object({
  body: z.string().trim().min(1, 'Écris quelque chose').max(1000, '1 000 caractères maximum'),
});

export interface ReactionCount {
  emoji: ReactionEmoji;
  count: number;
}

/** Réactions d'un post ou d'une photo, avec celle de l'utilisateur connecté. */
export interface Reactions {
  counts: ReactionCount[];
  mine: ReactionEmoji | null;
}

export interface CommentDto {
  id: string;
  postId: string;
  author: { id: string; displayName: string };
  body: string;
  createdAt: string;
}

/** Photo de la planche contact d'un événement. */
export interface PlancheItem {
  mediaId: string;
  postId: string;
  author: { id: string; displayName: string };
  width: number | null;
  height: number | null;
  takenAt: string | null;
  reactionCount: number;
}

/**
 * Message temps réel (WebSocket). Ce sont des indications de rafraîchissement :
 * la PWA recharge les données concernées, le serveur reste la source de vérité.
 */
export type RealtimeMessage =
  | { type: 'post.created' | 'post.deleted' | 'media.ready'; eventId: string; postId: string }
  | { type: 'reaction.updated'; eventId: string; postId: string; mediaId?: string }
  | { type: 'comment.created' | 'comment.deleted'; eventId: string; postId: string };
