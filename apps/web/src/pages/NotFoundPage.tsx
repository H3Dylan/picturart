import { Link } from 'react-router';
import ui from '../components/ui.module.css';
import styles from './pages.module.css';

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
