import { mediaUrl, memoryLabel } from '@picturart/shared';
import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router';
import { useMemories } from '../lib/queries.ts';
import styles from './MemoryCards.module.css';

/** « IL Y A 1 AN · 12.07.2025 » : les journées passées du même jour, en tête du fil. */
export function MemoryCards() {
  const memories = useMemories().data ?? [];
  if (memories.length === 0) return null;
  return (
    <section aria-label="Souvenirs du jour" className={styles.list}>
      {memories.map((m) => (
        <Link
          key={`${m.eventId}-${m.date}`}
          to={`/evenements/${m.eventId}`}
          className={styles.card}
        >
          <img
            src={mediaUrl(m.mediaId, 'thumb')}
            alt=""
            className={styles.thumb}
            loading="lazy"
            decoding="async"
          />
          <span className={styles.body}>
            <span className={styles.label}>
              {memoryLabel(m.yearsAgo).toUpperCase()} · {m.date.split('-').reverse().join('.')}
            </span>
            <span className={styles.name}>{m.eventName}</span>
          </span>
          <ChevronRight size={20} strokeWidth={2} aria-hidden="true" />
        </Link>
      ))}
    </section>
  );
}
