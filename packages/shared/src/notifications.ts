import { z } from 'zod';

/** Ce qui alimente l'écran Activité (et, selon les préférences, les notifications push). */
export const NOTIFICATION_TYPES = ['post', 'reaction', 'comment', 'member', 'memory'] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

/** Réglages « Me prévenir quand… » de l'écran Mon profil (notifications push). */
export const notificationPrefsSchema = z.object({
  posts: z.boolean(),
  reactions: z.boolean(),
  comments: z.boolean(),
  memories: z.boolean(),
});
export type NotificationPrefs = z.infer<typeof notificationPrefsSchema>;
export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  posts: true,
  reactions: true,
  comments: true,
  memories: true,
};

/** Préférence qui commande la notification push de chaque type (null : jamais envoyé en push). */
export const PREF_OF_TYPE: Record<NotificationType, keyof NotificationPrefs | null> = {
  post: 'posts',
  reaction: 'reactions',
  comment: 'comments',
  member: null,
  memory: 'memories',
};

export interface NotificationDto {
  id: string;
  type: NotificationType;
  createdAt: string;
  read: boolean;
  /** Absent pour un souvenir (rien n'a été fait par quelqu'un). */
  actor: { id: string; displayName: string } | null;
  event: { id: string; name: string };
  postId: string | null;
  /** Vignette : la photo réagie, sinon le premier média prêt du post. */
  mediaId: string | null;
  /** Réaction : sur le post entier, ou sur une photo ou une vidéo précise. */
  target: 'post' | 'photo' | 'video' | null;
  emoji: string | null;
  /** Réaction perso utilisée (sinon `emoji` est un emoji de base). */
  customReaction: { id: string; name: string } | null;
  /** Début du commentaire ; jour du souvenir (AAAA-MM-JJ) pour un souvenir. */
  excerpt: string | null;
  /** Contenu d'un post. */
  photos: number;
  videos: number;
}

export interface NotificationsPage {
  items: NotificationDto[];
  nextCursor: string | null;
  unread: number;
}

export const markReadSchema = z.object({
  /** Sans identifiants : tout marquer comme lu. */
  ids: z.array(z.uuid()).max(100).optional(),
});

export const pushSubscriptionSchema = z.object({
  endpoint: z.url().startsWith('https://', 'Adresse de push invalide').max(1000),
  keys: z.object({ p256dh: z.string().min(1).max(200), auth: z.string().min(1).max(100) }),
});
export type PushSubscriptionInput = z.infer<typeof pushSubscriptionSchema>;

export const unsubscribePushSchema = z.object({ endpoint: z.string().max(1000) });

export const muteEventSchema = z.object({ muted: z.boolean() });

/** Contenu d'une notification push, lu par le service worker. */
export interface PushPayload {
  title: string;
  body: string;
  url: string;
  /** Regroupe sur l'appareil : une nouvelle notification remplace la précédente du même tag. */
  tag: string;
  unread: number;
}

const capitalizeIfMemory = (n: NotificationDto) => {
  const text = describeNotification(n);
  return n.actor ? text : text.charAt(0).toUpperCase() + text.slice(1);
};

const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`;

/** « 6 photos », « 2 vidéos », « 3 photos et 1 vidéo ». */
export function mediaSummary(photos: number, videos: number) {
  return (
    [
      photos ? plural(photos, 'photo', 'photos') : '',
      videos ? plural(videos, 'vidéo', 'vidéos') : '',
    ]
      .filter(Boolean)
      .join(' et ') || 'un post'
  );
}

const TARGETS = { post: 'ton post', photo: 'ta photo', video: 'ta vidéo' } as const;

/** Phrase sans le prénom : « a posté 6 photos dans Anniv' de Tom ». */
export function describeNotification(n: NotificationDto) {
  switch (n.type) {
    case 'post':
      return `a posté ${mediaSummary(n.photos, n.videos)} dans ${n.event.name}`;
    case 'reaction':
      return `a réagi ${n.customReaction ? `« ${n.customReaction.name} »` : (n.emoji ?? '')} à ${TARGETS[n.target ?? 'post']}`;
    case 'comment':
      return n.excerpt ? `a commenté : « ${n.excerpt} »` : 'a commenté ton post';
    case 'member':
      return `a rejoint ${n.event.name}`;
    case 'memory': {
      const years = n.excerpt ? yearsBetween(n.excerpt, n.createdAt) : 1;
      return `${years} an${years > 1 ? 's' : ''} déjà : ${n.event.name}, le ${frenchDate(n.excerpt)}`;
    }
  }
}

const yearsBetween = (day: string, iso: string) =>
  Math.max(1, Number(iso.slice(0, 4)) - Number(day.slice(0, 4)));

const frenchDate = (day: string | null) => (day ? day.split('-').reverse().join('.') : '');

/** Nom affiché de l'auteur (« Souvenir » quand personne n'est à l'origine). */
export const actorName = (n: NotificationDto) => n.actor?.displayName ?? 'Souvenir';

/** Où mène une notification. */
export function notificationLink(n: NotificationDto) {
  if (n.type === 'comment' && n.postId) return `/posts/${n.postId}/commentaires`;
  if (n.type === 'member') return `/evenements/${n.event.id}/membres`;
  if (n.type === 'memory') return `/evenements/${n.event.id}`;
  return `/evenements/${n.event.id}?vue=posts`;
}

/**
 * Une notification push pour une salve : « Léa a ajouté 17 photos dans Week-end Bretagne »
 * plutôt que 17 notifications. Les éléments arrivent du plus ancien au plus récent.
 */
export function summarizeForPush(items: NotificationDto[], unread: number): PushPayload | null {
  const last = items.at(-1);
  if (!last) return null;
  const events = new Set(items.map((n) => n.event.id));
  const oneEvent = events.size === 1;
  const tag = oneEvent ? `event-${last.event.id}` : 'activite';

  if (items.every((n) => n.type === 'post')) {
    const names = [...new Set(items.map(actorName))];
    const who =
      names.length === 1
        ? names[0]
        : names.length === 2
          ? `${names[0]} et ${names[1]}`
          : `${names[0]}, ${names[1]} et ${plural(names.length - 2, 'autre', 'autres')}`;
    const photos = items.reduce((sum, n) => sum + n.photos, 0);
    const videos = items.reduce((sum, n) => sum + n.videos, 0);
    const verb = names.length === 1 ? 'a ajouté' : 'ont ajouté';
    return {
      title: oneEvent ? last.event.name : "Pictur'Art",
      body: `${who} ${verb} ${mediaSummary(photos, videos)}${oneEvent ? '' : ' dans tes événements'}`,
      url: oneEvent ? `/evenements/${last.event.id}?vue=posts` : '/activite',
      tag,
      unread,
    };
  }

  const others = items.length - 1;
  return {
    title: oneEvent ? last.event.name : "Pictur'Art",
    body: `${last.actor ? `${last.actor.displayName} ` : ''}${capitalizeIfMemory(last)}${others ? ` · et ${plural(others, 'autre nouveauté', 'autres nouveautés')}` : ''}`,
    url: items.length === 1 ? notificationLink(last) : '/activite',
    tag,
    unread,
  };
}
