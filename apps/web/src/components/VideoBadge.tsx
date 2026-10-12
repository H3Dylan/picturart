import { Play } from 'lucide-react';
import { formatDuration } from '../lib/format.ts';
import styles from './VideoBadge.module.css';

/** Pastille ▶ 0:42 posée sur la vignette d'une vidéo. */
export function VideoBadge({ durationMs }: { durationMs: number | null }) {
  return (
    <span className={styles.badge}>
      <Play size={10} fill="currentColor" strokeWidth={0} aria-hidden="true" />
      {formatDuration(durationMs)}
    </span>
  );
}
