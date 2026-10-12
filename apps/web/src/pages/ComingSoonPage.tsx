import { Link } from 'react-router';
import { FilmStrip } from '../components/FilmStrip.tsx';
import ui from '../components/ui.module.css';
import styles from './pages.module.css';

interface ComingSoonProps {
  title: string;
  milestone: string;
}

/** Écrans prévus aux jalons suivants (fil, activité, poster). */
export function ComingSoonPage({ title, milestone }: ComingSoonProps) {
  return (
    <main className={`${styles.screen} ${styles.withNav}`}>
      <div className={styles.stack} style={{ gap: 8 }}>
        <p className={ui.metaAccent}>{milestone}</p>
        <h1 className={ui.pageTitle}>{title}</h1>
        <p className={styles.lead}>
          Ça se développe. En attendant, invite la bande dans tes événements.
        </p>
      </div>
      <FilmStrip />
      <Link to="/evenements" className={ui.buttonSecondary}>
        Voir mes événements
      </Link>
    </main>
  );
}

export function NotFoundPage() {
  return (
    <main className={styles.screen}>
      <p className={ui.metaAccent}>Pose 404</p>
      <h1 className={ui.pageTitle}>Cette photo n'a pas été développée.</h1>
      <Link to="/" className={ui.button}>
        Revenir à l'accueil
      </Link>
    </main>
  );
}
