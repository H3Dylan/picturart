import styles from '../pages/pages.module.css';

const FRAMES = [
  { label: '01', color: '#3e7f9a' },
  { label: '01A', color: '#d4673a' },
  { label: '02', color: '#e9a866' },
  { label: '02A', color: '#3b2a44' },
  { label: '03', color: '#6e8a6c' },
  { label: '03A', color: '#e3b2a6' },
];

/** Planche contact décorative, en attendant les vraies photos. */
export function FilmStrip({ count = 6 }: { count?: 3 | 6 }) {
  return (
    <div className={styles.film} aria-hidden="true">
      <div className={styles.sprockets} />
      <ul className={styles.frames}>
        {FRAMES.slice(0, count).map((frame) => (
          <li key={frame.label}>
            <span className={styles.frame} style={{ background: frame.color }} />
            <span className={styles.frameNumber}>{frame.label}</span>
          </li>
        ))}
      </ul>
      <div className={styles.sprockets} />
    </div>
  );
}
