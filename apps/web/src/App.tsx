import { APP_NAME, healthSchema } from '@picturart/shared';
import { Camera } from 'lucide-react';
import { useEffect, useState } from 'react';
import styles from './App.module.css';

type ServerState = 'loading' | 'online' | 'offline';

const FRAMES = [
  { label: '01', color: '#3E7F9A' },
  { label: '01A', color: '#D4673A' },
  { label: '02', color: '#E9A866' },
  { label: '02A', color: '#3B2A44' },
  { label: '03', color: '#6E8A6C' },
  { label: '03A', color: '#E3B2A6' },
];

const SERVER_LABEL: Record<ServerState, string> = {
  loading: 'Connexion au serveur…',
  online: 'Serveur en ligne',
  offline: 'Serveur injoignable',
};

function rollLabel(date: Date) {
  const month = date.toLocaleDateString('fr-FR', { month: 'short' }).replace('.', '');
  return `ROLL 001 · ${month.toUpperCase()} ${date.getFullYear()}`;
}

export function App() {
  const [server, setServer] = useState<ServerState>('loading');

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/v1/health', { signal: controller.signal })
      .then((response) => response.json())
      .then((body) => {
        const health = healthSchema.parse(body);
        setServer(health.status === 'ok' ? 'online' : 'offline');
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          console.error(error);
          setServer('offline');
        }
      });
    return () => controller.abort();
  }, []);

  return (
    <main className={styles.page}>
      <header className={styles.brand}>
        <span className={styles.logo} aria-hidden="true">
          <Camera size={22} strokeWidth={1.8} />
        </span>
        <span className={styles.brandName}>{APP_NAME}</span>
      </header>

      <section className={styles.hero}>
        <p className={styles.meta}>{rollLabel(new Date())}</p>
        <h1 className={styles.title}>Ça se développe.</h1>
        <p className={styles.lead}>
          Le réseau social privé de la bande : vos soirées, vos voyages et vos têtes, en qualité
          originale. Les invitations partent bientôt.
        </p>
      </section>

      <section className={styles.film} aria-label="Planche contact décorative">
        <div className={styles.sprockets} aria-hidden="true" />
        <ul className={styles.frames}>
          {FRAMES.map((frame) => (
            <li key={frame.label}>
              <span className={styles.frame} style={{ background: frame.color }} />
              <span className={styles.frameNumber}>{frame.label}</span>
            </li>
          ))}
        </ul>
        <div className={styles.sprockets} aria-hidden="true" />
      </section>

      <p className={styles.status} data-state={server} role="status">
        <span className={styles.dot} aria-hidden="true" />
        {SERVER_LABEL[server]}
      </p>

      <footer className={styles.footer}>RÉSEAU PRIVÉ · SUR INVITATION UNIQUEMENT</footer>
    </main>
  );
}
