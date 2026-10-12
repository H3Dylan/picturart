import { Bell, X } from 'lucide-react';
import { useState } from 'react';
import { dismissNudge, nudgeDismissed, usePush } from '../lib/pwa.ts';
import styles from './NotificationsNudge.module.css';
import ui from './ui.module.css';

/**
 * Invitation à activer les notifications, en tête du fil, tant qu'elles sont coupées sur cet
 * appareil. Sur iPhone, c'est ici qu'on les active : une fois l'app ouverte depuis l'icône.
 */
export function NotificationsNudge() {
  const push = usePush();
  const [hidden, setHidden] = useState(nudgeDismissed);
  if (hidden || push.state !== 'off') return null;

  const close = () => {
    dismissNudge();
    setHidden(true);
  };

  return (
    <section className={styles.nudge} aria-label="Notifications">
      <Bell size={22} strokeWidth={1.8} aria-hidden="true" className={styles.icon} />
      <div className={styles.body}>
        <p className={styles.title}>Active les notifs</p>
        <p className={styles.text}>Pour savoir quand la bande poste ou réagit, regroupées.</p>
        <button
          type="button"
          className={`${ui.button} ${ui.buttonSmall}`}
          onClick={() => void push.enable().then(close)}
          disabled={push.busy}
        >
          {push.busy ? 'Activation…' : 'Activer'}
        </button>
      </div>
      <button type="button" className={styles.close} onClick={close} aria-label="Plus tard">
        <X size={18} strokeWidth={2} />
      </button>
    </section>
  );
}
