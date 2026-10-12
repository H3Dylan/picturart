import { type MediaDto, mediaUrl, type PostDto } from '@picturart/shared';
import { useState } from 'react';
import { timeAgo } from '../lib/format.ts';
import { useUploads } from '../lib/uploads.ts';
import { Avatar } from './Avatar.tsx';
import styles from './PostCard.module.css';
import ui from './ui.module.css';

interface PostCardProps {
  post: PostDto;
  isAuthor: boolean;
  onDelete: () => void;
  deleting: boolean;
}

export function PostCard({ post, isAuthor, onDelete, deleting }: PostCardProps) {
  const [confirming, setConfirming] = useState(false);
  const count = post.media.length;
  const shown = post.media.slice(0, 3);
  const layout = count >= 3 ? styles.grid3 : count === 2 ? styles.grid2 : styles.grid1;

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
          <div className={styles.muted}>{timeAgo(post.createdAt)}</div>
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
              large={index === 0}
              more={index === 2 && count > 3 ? count - 3 : 0}
            />
          ))}
        </div>
      )}

      {post.caption && <p className={styles.caption}>{post.caption}</p>}
    </article>
  );
}

function MediaTile({ media, large, more }: { media: MediaDto; large: boolean; more: number }) {
  const uploads = useUploads();
  const upload = uploads.get(media.id);
  const ready = media.status === 'ready';

  let overlay: string | null = null;
  if (!ready) {
    if (upload?.status === 'error') overlay = 'Échec de l’envoi';
    else if (media.status === 'uploading')
      overlay = upload ? `${Math.round(upload.progress * 100)} %` : 'En attente';
    else overlay = 'Développement…';
  }

  return (
    <a
      href={ready ? mediaUrl(media.id, 'original') : undefined}
      className={`${styles.tile} ${large ? styles.large : ''}`}
      aria-label={ready ? 'Ouvrir la photo en qualité originale' : undefined}
    >
      {ready && (
        <img
          src={mediaUrl(media.id, large ? 'display' : 'thumb')}
          alt=""
          loading="lazy"
          decoding="async"
          className={styles.img}
        />
      )}
      {overlay && <span className={styles.overlay}>{overlay}</span>}
      {upload?.status === 'uploading' && (
        <span className={styles.progress} style={{ width: `${upload.progress * 100}%` }} />
      )}
      {more > 0 && <span className={styles.more}>+{more}</span>}
    </a>
  );
}
