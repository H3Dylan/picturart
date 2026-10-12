import { z } from 'zod';
import type { MediaKind } from './posts.ts';

/** Réactions emoji de base. */
export const REACTION_EMOJIS = ['❤️', '😂', '🔥', '😍', '😮', '👏'] as const;
export type ReactionEmoji = (typeof REACTION_EMOJIS)[number];

/** Réaction perso de la bande (« Tom choqué »), désignée par son identifiant. */
export type CustomReactionKey = `custom:${string}`;
/** Ce qu'on stocke et échange pour une réaction : un emoji de base ou une réaction perso. */
export type ReactionKey = ReactionEmoji | CustomReactionKey;

const CUSTOM_KEY = /^custom:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export const isCustomReaction = (key: string): key is CustomReactionKey => CUSTOM_KEY.test(key);
export const customReactionKey = (id: string): CustomReactionKey => `custom:${id}`;
export const customReactionId = (key: CustomReactionKey) => key.slice('custom:'.length);

export const reactionSchema = z.object({
  emoji: z.union([
    z.enum(REACTION_EMOJIS),
    z
      .string()
      .regex(CUSTOM_KEY)
      .transform((key) => key as CustomReactionKey),
  ]),
});

export const commentSchema = z.object({
  body: z.string().trim().min(1, 'Écris quelque chose').max(1000, '1 000 caractères maximum'),
});

export interface ReactionCount {
  emoji: ReactionKey;
  count: number;
}

/** Réactions d'un post ou d'une photo, avec celle de l'utilisateur connecté. */
export interface Reactions {
  counts: ReactionCount[];
  mine: ReactionKey | null;
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
  kind: MediaKind;
  width: number | null;
  height: number | null;
  durationMs: number | null;
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
  | { type: 'comment.created' | 'comment.deleted'; eventId: string; postId: string }
  /** Envoyé au seul destinataire : l'écran Activité et le badge se mettent à jour. */
  | { type: 'notification.created' };
