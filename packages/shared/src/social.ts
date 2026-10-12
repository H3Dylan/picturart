import { z } from 'zod';
import type { MediaKind } from './posts.ts';

/** Emojis proposés d'un appui ; tous les autres sont dans le sélecteur complet. */
export const REACTION_EMOJIS = ['❤️', '😂', '🔥', '😍', '😮', '👏'] as const;
export type ReactionEmoji = (typeof REACTION_EMOJIS)[number];

/** Réaction perso de la bande (« Tom choqué »), désignée par son identifiant. */
export type CustomReactionKey = `custom:${string}`;
/** Ce qu'on stocke et échange pour une réaction : n'importe quel emoji, ou une réaction perso. */
export type ReactionKey = string;

const CUSTOM_KEY = /^custom:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
/** Un seul emoji de la liste officielle Unicode (couleurs de peau, drapeaux et familles compris). */
const RGI_EMOJI = /^\p{RGI_Emoji}$/v;

export const isCustomReaction = (key: string): key is CustomReactionKey => CUSTOM_KEY.test(key);
export const customReactionKey = (id: string): CustomReactionKey => `custom:${id}`;
export const customReactionId = (key: CustomReactionKey) => key.slice('custom:'.length);

/**
 * Forme officielle d'un emoji, pour qu'un même emoji donne toujours la même pastille :
 * 👍️ (sélecteur de présentation en trop) devient 👍, ❤ (sans) devient ❤️.
 * Renvoie null pour tout ce qui n'est pas exactement un emoji (texte, deux emojis…).
 */
export function normalizeEmoji(value: string): string | null {
  if (RGI_EMOJI.test(value)) return value;
  const bare = value.replace(/️/g, '');
  if (RGI_EMOJI.test(bare)) return bare;
  const qualified = bare.replace(/^(\P{M})/u, '$1️');
  return RGI_EMOJI.test(qualified) ? qualified : null;
}

export const reactionSchema = z.object({
  emoji: z
    .string()
    .max(64)
    .transform((value, ctx) => {
      if (CUSTOM_KEY.test(value)) return value as ReactionKey;
      const emoji = normalizeEmoji(value);
      if (emoji) return emoji;
      ctx.addIssue({ code: 'custom', message: 'Ce n’est pas un emoji.' });
      return z.NEVER;
    }),
});

export const commentSchema = z.object({
  body: z.string().trim().min(1, 'Écris quelque chose').max(1000, '1 000 caractères maximum'),
});

export interface ReactionCount {
  emoji: ReactionKey;
  count: number;
}

/** Plusieurs réactions par personne et par post ou photo, dans cette limite. */
export const MAX_REACTIONS_PER_PERSON = 6;

/** Réactions d'un post ou d'une photo, avec celles de l'utilisateur connecté. */
export interface Reactions {
  counts: ReactionCount[];
  mine: ReactionKey[];
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
