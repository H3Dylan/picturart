import { type MediaDto, mediaUrl, type PostDto, type ReactionEmoji } from '@picturart/shared';
import { MessageCircle } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { timeAgo } from '../lib/format.ts';
import { useReact } from '../lib/queries.ts';
import { useUploads } from '../lib/uploads.ts';
import { useDoubleTap } from '../lib/useDoubleTap.ts';
import { Avatar } from './Avatar.tsx';
import styles from './PostCard.module.css';
import { applyReaction, ReactionBar } from './ReactionBar.tsx';
import ui from './ui.module.css';

interface PostCardProps {
  post: PostDto;
  isAuthor: boolean;
  onDelete: () => void;
  deleting: boolean;
  /** Afficher le nom de l'événement (dans le fil). */
  showEvent?: boolean;
}

export function PostCard({ post, isAuthor, onDelete, deleting, showEvent = false }: PostCardProps) {
  const [confirming, setConfirming] = useState(false);
  const [reactions, setReactions] = useState(post.reactions);
  const [heart, setHeart] = useState(0);
  const react = useReact({ kind: 'post', id: post.id, postId: post.id, eventId: post.eventId });
  const count = post.media.length;
  const shown = post.media.slice(0, 3);
  const layout = count >= 3 ? styles.grid3 : count === 2 ? styles.grid2 : styles.grid1;

  // Les données du serveur font foi dès qu'elles changent
  const [seen, setSeen] = useState(post.reactions);
  if (seen !== post.reactions) {
    setSeen(post.reactions);
    setReactions(post.reactions);
  }

  function onReact(emoji: ReactionEmoji | null) {
    setReactions((current) => applyReaction(current, emoji));
    react.mutate(emoji, { onSuccess: setReactions });
  }

  function like() {
    setHeart((n) => n + 1);
    if (reactions.mine !== '❤️') onReact('❤️');
  }

  return (
    <article className={`${ui.card} ${styles.card}`}>
      <header className={styles.header}>
        <Avatar id={post.author.id} name={post.author.displayName} />
        <div className={styles.who}>
          <div className={styles.name}>
            {post.author.displayName}{' '}
            <span className={styles.muted}>
              a posté {count} {count > 1 ? 'photos' : 'photo'}
            </span>
          </div>
          <div className={styles.muted}>
            {showEvent && (
              <>
                <Link to={`/evenements/${post.eventId}`} className={styles.eventLink}>
                  {post.event.name}
                </Link>
                {' · '}
              </>
            )}
            {timeAgo(post.createdAt)}
          </div>
        </div>
        {isAuthor && !confirming && (
          <button type="button" className={ui.linkButton} onClick={() => setConfirming(true)}>
            Supprimer
          </button>
        )}
        {isAuthor && confirming && (
          <span className={styles.confirm}>
            <button type="button" className={ui.linkButton} onClick={() => setConfirming(false)}>
              Annuler
            </button>
            <button
              type="button"
              className={`${ui.button} ${ui.buttonSmall}`}
              onClick={onDelete}
              disabled={deleting}
            >
              Supprimer
            </button>
          </span>
        )}
      </header>

      {count > 0 && (
        <div className={`${styles.grid} ${layout}`}>
          {shown.map((media, index) => (
            <MediaTile
              key={media.id}
              media={media}
              postId={post.id}
              index={index}
              large={index === 0}
              more={index === 2 && count > 3 ? count - 3 : 0}
              onDoubleTap={like}
            />
          ))}
          {heart > 0 && (
            <span key={heart} className={styles.heart} aria-hidden="true">
              ❤️
            </span>
          )}
        </div>
      )}

      {post.caption && <p className={styles.caption}>{post.caption}</p>}

      <ReactionBar reactions={reactions} onReact={onReact} />

      <Link to={`/posts/${post.id}/commentaires`} className={styles.comments}>
        {post.lastComment ? (
          <>
            <Avatar
              id={post.lastComment.author.id}
              name={post.lastComment.author.displayName}
              size={24}
            />
            <span className={styles.commentText}>
              <strong>{post.lastComment.author.displayName}</strong> {post.lastComment.body}
            </span>
            {post.commentCount > 1 && (
              <span className={styles.more2}>+{post.commentCount - 1}</span>
            )}
          </>
        ) : (
          <>
            <MessageCircle size={18} strokeWidth={1.8} aria-hidden="true" />
            <span className={styles.commentText}>Ajouter un commentaire</span>
          </>
        )}
      </Link>
    </article>
  );
}

interface MediaTileProps {
  media: MediaDto;
  postId: string;
  index: number;
  large: boolean;
  more: number;
  onDoubleTap: () => void;
}

function MediaTile({ media, postId, index, large, more, onDoubleTap }: MediaTileProps) {
  const navigate = useNavigate();
  const uploads = useUploads();
  const upload = uploads.get(media.id);
  const ready = media.status === 'ready';
  const tap = useDoubleTap(() => navigate(`/posts/${postId}/photos/${index}`), onDoubleTap);

  let overlay: string | null = null;
  if (!ready) {
    if (upload?.status === 'error') overlay = 'Échec de l’envoi';
    else if (media.status === 'uploading')
      overlay = upload ? `${Math.round(upload.progress * 100)} %` : 'En attente';
    else overlay = 'Développement…';
  }

  return (
    <button
      type="button"
      onClick={ready ? tap : undefined}
      disabled={!ready}
      className={`${styles.tile} ${large ? styles.large : ''}`}
      aria-label={ready ? `Ouvrir la photo ${index + 1} (double appui : ❤️)` : (overlay ?? '')}
    >
      {ready && (
        <img
          src={mediaUrl(media.id, large ? 'display' : 'thumb')}
          alt=""
          loading="lazy"
          decoding="async"
          className={styles.img}
          draggable={false}
        />
      )}
      {overlay && <span className={styles.overlay}>{overlay}</span>}
      {upload?.status === 'uploading' && (
        <span className={styles.progress} style={{ width: `${upload.progress * 100}%` }} />
      )}
      {more > 0 && <span className={styles.more}>+{more}</span>}
    </button>
  );
}
