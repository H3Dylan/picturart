import { Camera } from 'lucide-react';
import styles from './pages.module.css';

export function Splash() {
  return (
    <div className={styles.splash} role="status" aria-label="Chargement">
      <span className={styles.logoBig}>
        <Camera size={44} strokeWidth={1.8} />
      </span>
    </div>
  );
}
