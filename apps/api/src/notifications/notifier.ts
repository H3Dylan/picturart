import { and, eq, isNull, ne } from 'drizzle-orm';
import type { Db } from '../db/client.ts';
import { eventMembers, notifications, posts } from '../db/schema.ts';
import type { RealtimeHub } from '../realtime/hub.ts';

type NewNotification = typeof notifications.$inferInsert;

/** Longueur gardée d'un commentaire dans l'écran Activité et la notification push. */
const EXCERPT = 80;

/**
 * Crée les lignes de l'écran Activité au fil des actions, et prévient les destinataires
 * en direct. L'envoi push, regroupé, est l'affaire du worker (voir push/dispatcher.ts).
 * On ne se notifie jamais soi-même.
 */
export class Notifier {
  readonly #db: Db;
  readonly #hub: RealtimeHub;

  constructor(db: Db, hub: RealtimeHub) {
    this.#db = db;
    this.#hub = hub;
  }

  async #insert(rows: NewNotification[]) {
    if (rows.length === 0) return;
    await this.#db.insert(notifications).values(rows);
    this.#hub.publishToUsers(new Set(rows.map((r) => r.userId)), { type: 'notification.created' });
  }

  async #othersIn(eventId: string, actorId: string) {
    const members = await this.#db
      .select({ userId: eventMembers.userId })
      .from(eventMembers)
      .where(and(eq(eventMembers.eventId, eventId), ne(eventMembers.userId, actorId)));
    return members.map((m) => m.userId);
  }

  /** Nouveau post : toute la bande de l'événement. */
  async postCreated(post: { id: string; eventId: string; authorId: string }) {
    const recipients = await this.#othersIn(post.eventId, post.authorId);
    await this.#insert(
      recipients.map((userId) => ({
        userId,
        type: 'post' as const,
        actorId: post.authorId,
        eventId: post.eventId,
        postId: post.id,
      })),
    );
  }

  /** Post supprimé : ses notifications disparaissent avec lui. */
  async postDeleted(postId: string) {
    await this.#db.delete(notifications).where(eq(notifications.postId, postId));
  }

  /** Nouveau membre : le reste de la bande le voit arriver (écran Activité seulement). */
  async memberJoined(eventId: string, userId: string) {
    const recipients = await this.#othersIn(eventId, userId);
    await this.#insert(
      recipients.map((recipient) => ({
        userId: recipient,
        type: 'member' as const,
        actorId: userId,
        eventId,
      })),
    );
  }

  async #postAuthor(postId: string) {
    const [post] = await this.#db
      .select({ authorId: posts.authorId, eventId: posts.eventId })
      .from(posts)
      .where(eq(posts.id, postId))
      .limit(1);
    return post;
  }

  /** Réaction à un post ou à une photo : l'auteur du post est prévenu, une fois par emoji. */
  async reacted(actorId: string, postId: string, mediaId: string | null, emoji: string) {
    await this.unreacted(actorId, postId, mediaId, emoji);
    const post = await this.#postAuthor(postId);
    if (!post || post.authorId === actorId) return;
    await this.#insert([
      {
        userId: post.authorId,
        type: 'reaction',
        actorId,
        eventId: post.eventId,
        postId,
        mediaId,
        emoji,
      },
    ]);
  }

  async unreacted(actorId: string, postId: string, mediaId: string | null, emoji: string) {
    await this.#db
      .delete(notifications)
      .where(
        and(
          eq(notifications.type, 'reaction'),
          eq(notifications.actorId, actorId),
          eq(notifications.postId, postId),
          mediaId ? eq(notifications.mediaId, mediaId) : isNull(notifications.mediaId),
          eq(notifications.emoji, emoji),
        ),
      );
  }

  /** Commentaire : l'auteur du post est prévenu. */
  async commented(actorId: string, postId: string, commentId: string, body: string) {
    const post = await this.#postAuthor(postId);
    if (!post || post.authorId === actorId) return;
    const excerpt = body.length > EXCERPT ? `${body.slice(0, EXCERPT - 1).trimEnd()}…` : body;
    await this.#insert([
      {
        userId: post.authorId,
        type: 'comment',
        actorId,
        eventId: post.eventId,
        postId,
        commentId,
        excerpt,
      },
    ]);
  }

  async commentDeleted(commentId: string) {
    await this.#db.delete(notifications).where(eq(notifications.commentId, commentId));
  }
}

/** Une notification ratée ne doit jamais faire échouer l'action qui l'a déclenchée. */
export async function quietly(
  task: Promise<void>,
  log: { warn: (obj: object, msg: string) => void },
) {
  try {
    await task;
  } catch (error) {
    log.warn({ err: error }, 'notification non créée');
  }
}
