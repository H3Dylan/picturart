import { mediaUrl, type PlancheItem } from '@picturart/shared';
import { Link } from 'react-router';
import styles from './Planche.module.css';
import { VideoBadge } from './VideoBadge.tsx';

/** Numéro de pose façon pellicule : 01, 01A, 02, 02A… */
export function frameNumber(index: number) {
  return `${String(Math.floor(index / 2) + 1).padStart(2, '0')}${index % 2 ? 'A' : ''}`;
}

interface PlancheProps {
  items: PlancheItem[];
  eventId: string;
  best?: boolean;
}

/** Planche contact : toutes les photos de l'événement sur une bande de pellicule. */
export function Planche({ items, eventId, best = false }: PlancheProps) {
  const top = Math.max(0, ...items.map((i) => i.reactionCount));

  return (
    <section
      className={styles.film}
      aria-label={best ? 'Les meilleures photos' : 'Planche contact'}
    >
      <div className={styles.sprockets} aria-hidden="true" />
      <ul className={styles.frames}>
        {items.map((item, index) => {
          const star = top > 0 && item.reactionCount === top;
          return (
            <li key={item.mediaId}>
              <Link
                to={`/evenements/${eventId}/photos/${index}${best ? '?tri=meilleures' : ''}`}
                className={`${styles.frame} ${star ? styles.star : ''}`}
                aria-label={`${item.kind === 'video' ? 'Vidéo' : 'Photo'} ${index + 1} de ${item.author.displayName}${item.reactionCount ? `, ${item.reactionCount} réactions` : ''}`}
              >
                <img
                  src={mediaUrl(item.mediaId, 'thumb')}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className={styles.img}
                />
                {item.kind === 'video' && <VideoBadge durationMs={item.durationMs} />}
              </Link>
              <span className={styles.number}>
                {frameNumber(index)}
                {star && ' ★'}
                {item.reactionCount > 0 && ` · ${item.reactionCount}`}
              </span>
            </li>
          );
        })}
      </ul>
      <div className={styles.sprockets} aria-hidden="true" />
    </section>
  );
}
