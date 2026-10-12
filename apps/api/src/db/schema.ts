import { DEFAULT_NOTIFICATION_PREFS, type NotificationPrefs } from '@picturart/shared';
import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();

export const themeEnum = pgEnum('theme', ['auto', 'light', 'dark']);
export const roleEnum = pgEnum('event_role', ['admin', 'contributor', 'viewer']);
export const mediaKindEnum = pgEnum('media_kind', ['photo', 'video']);
export const mediaStatusEnum = pgEnum('media_status', [
  'uploading',
  'processing',
  'ready',
  'failed',
]);
export const notificationTypeEnum = pgEnum('notification_type', [
  'post',
  'reaction',
  'comment',
  'member',
  'memory',
]);
export const variantEnum = pgEnum('media_variant', ['thumb', 'display', 'video']);

export const users = pgTable('users', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  displayName: text('display_name').notNull(),
  /** Toujours stocké en minuscules. */
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  bio: text('bio').notNull().default(''),
  theme: themeEnum('theme').notNull().default('auto'),
  notificationPrefs: jsonb('notification_prefs')
    .$type<NotificationPrefs>()
    .notNull()
    .default(DEFAULT_NOTIFICATION_PREFS),
  createdAt: createdAt(),
});

export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** SHA-256 du jeton du cookie : le jeton lui-même n'est jamais stocké. */
    tokenHash: text('token_hash').notNull().unique(),
    userAgent: text('user_agent'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: createdAt(),
  },
  (t) => [index('sessions_user_idx').on(t.userId)],
);

export const events = pgTable('events', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  name: text('name').notNull(),
  startsOn: date('starts_on'),
  endsOn: date('ends_on'),
  location: text('location'),
  createdBy: uuid('created_by')
    .notNull()
    .references(() => users.id),
  createdAt: createdAt(),
  archivedAt: timestamp('archived_at', { withTimezone: true }),
});

export const eventMembers = pgTable(
  'event_members',
  {
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: roleEnum('role').notNull(),
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
    /** Notifications push coupées pour cet événement. */
    muted: boolean('muted').notNull().default(false),
  },
  (t) => [primaryKey({ columns: [t.eventId, t.userId] }), index('members_user_idx').on(t.userId)],
);

export const invites = pgTable(
  'invites',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    defaultRole: roleEnum('default_role').notNull().default('contributor'),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    useCount: integer('use_count').notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('invites_token_idx').on(t.tokenHash)],
);

export const posts = pgTable(
  'posts',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    authorId: uuid('author_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    caption: text('caption').notNull().default(''),
    createdAt: createdAt(),
    updatedAt: timestamp('updated_at', { withTimezone: true }),
    /** Corbeille : supprimé définitivement après 30 jours. */
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [index('posts_event_created_idx').on(t.eventId, t.createdAt)],
);

export const media = pgTable(
  'media',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    postId: uuid('post_id')
      .notNull()
      .references(() => posts.id, { onDelete: 'cascade' }),
    uploaderId: uuid('uploader_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: mediaKindEnum('kind').notNull().default('photo'),
    status: mediaStatusEnum('status').notNull().default('uploading'),
    position: integer('position').notNull(),
    originalName: text('original_name').notNull(),
    declaredMime: text('declared_mime').notNull(),
    declaredSize: bigint('declared_size', { mode: 'number' }).notNull(),
    /** Chemin relatif au dossier des médias, une fois l'envoi terminé. */
    originalPath: text('original_path'),
    mime: text('mime'),
    sizeBytes: bigint('size_bytes', { mode: 'number' }),
    sha256: text('sha256'),
    width: integer('width'),
    height: integer('height'),
    takenAt: timestamp('taken_at', { withTimezone: true }),
    durationMs: integer('duration_ms'),
    error: text('error'),
    /** File de traitement : un worker réserve le média (SKIP LOCKED) et note l'heure de prise en charge. */
    attempts: integer('attempts').notNull().default(0),
    processingStartedAt: timestamp('processing_started_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    index('media_post_idx').on(t.postId, t.position),
    index('media_sha_idx').on(t.sha256),
    index('media_jobs_idx').on(t.kind, t.createdAt).where(sql`${t.status} = 'processing'`),
  ],
);

export const mediaVariants = pgTable(
  'media_variants',
  {
    mediaId: uuid('media_id')
      .notNull()
      .references(() => media.id, { onDelete: 'cascade' }),
    variant: variantEnum('variant').notNull(),
    path: text('path').notNull(),
    width: integer('width').notNull(),
    height: integer('height').notNull(),
    sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.mediaId, t.variant] })],
);

/** Une réaction par personne et par post (la clé primaire le garantit). */
export const postReactions = pgTable(
  'post_reactions',
  {
    postId: uuid('post_id')
      .notNull()
      .references(() => posts.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    emoji: text('emoji').notNull(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.postId, t.userId, t.emoji] })],
);

/** Réactions sur une photo : plusieurs par personne, une seule fois chaque emoji. */
export const mediaReactions = pgTable(
  'media_reactions',
  {
    mediaId: uuid('media_id')
      .notNull()
      .references(() => media.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    emoji: text('emoji').notNull(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.mediaId, t.userId, t.emoji] })],
);

export const comments = pgTable(
  'comments',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    postId: uuid('post_id')
      .notNull()
      .references(() => posts.id, { onDelete: 'cascade' }),
    authorId: uuid('author_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    body: text('body').notNull(),
    createdAt: createdAt(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [index('comments_post_created_idx').on(t.postId, t.createdAt)],
);

/**
 * Une ligne par chose arrivée à quelqu'un : alimente l'écran Activité. Le worker regroupe
 * ensuite les lignes pas encore poussées (`pushed_at` vide) en une notification push par salve.
 */
export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    /** Destinataire. */
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: notificationTypeEnum('type').notNull(),
    /** Vide pour un souvenir. */
    actorId: uuid('actor_id').references(() => users.id, { onDelete: 'cascade' }),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    postId: uuid('post_id').references(() => posts.id, { onDelete: 'cascade' }),
    mediaId: uuid('media_id').references(() => media.id, { onDelete: 'cascade' }),
    commentId: uuid('comment_id').references(() => comments.id, { onDelete: 'cascade' }),
    emoji: text('emoji'),
    excerpt: text('excerpt'),
    readAt: timestamp('read_at', { withTimezone: true }),
    pushedAt: timestamp('pushed_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    index('notifications_user_created_idx').on(t.userId, t.createdAt),
    index('notifications_pending_idx').on(t.userId).where(sql`${t.pushedAt} is null`),
  ],
);

/** Un abonnement Web Push par appareil (navigateur ou PWA installée). */
export const pushSubscriptions = pgTable(
  'push_subscriptions',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    endpoint: text('endpoint').notNull().unique(),
    p256dh: text('p256dh').notNull(),
    auth: text('auth').notNull(),
    userAgent: text('user_agent'),
    createdAt: createdAt(),
    lastSuccessAt: timestamp('last_success_at', { withTimezone: true }),
  },
  (t) => [index('push_subscriptions_user_idx').on(t.userId)],
);

/**
 * Réactions perso de la bande : une tête recadrée dans une photo, avec un nom (« Tom choqué »).
 * Utilisables par tous les comptes ; une réaction les désigne par la clé `custom:<id>`.
 */
export const customReactions = pgTable(
  'custom_reactions',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    name: text('name').notNull(),
    /** Image carrée WebP, relative au dossier des médias. */
    imagePath: text('image_path').notNull(),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    sourceMediaId: uuid('source_media_id').references(() => media.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
  },
  (t) => [index('custom_reactions_created_by_idx').on(t.createdBy)],
);
