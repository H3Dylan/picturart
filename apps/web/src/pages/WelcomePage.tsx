import { Bell, Camera, Download, Share, SquarePlus } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router';
import ui from '../components/ui.module.css';
import { dismissNudge, isIos, isStandalone, useInstallPrompt, usePush } from '../lib/pwa.ts';
import styles from './pages.module.css';
import w from './WelcomePage.module.css';

/**
 * Juste après l'inscription : installer l'app sur l'écran d'accueil, puis activer les
 * notifications. Sur iPhone, le push n'existe qu'une fois l'app installée : on guide
 * l'installation, et l'invitation à activer les notifications reviendra dans l'app.
 */
export function WelcomePage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = params.get('suite')?.startsWith('/') ? (params.get('suite') as string) : '/fil';
  const install = useInstallPrompt();
  const push = usePush();
  const standalone = isStandalone();
  const iosBrowser = isIos() && !standalone;

  const leave = () => {
    if (push.state !== 'off') dismissNudge();
    navigate(next, { replace: true });
  };

  async function activate() {
    await push.enable();
    dismissNudge();
    navigate(next, { replace: true });
  }

  const canActivate = push.state === 'off';

  return (
    <main className={`${styles.screen} ${w.screen}`}>
      <p className={`${ui.meta} ${w.step}`}>{standalone ? 'DERNIÈRE ÉTAPE' : 'ÉTAPE 2/2'}</p>

      <section className={w.intro}>
        <span className={w.icon} aria-hidden="true">
          <Camera size={38} strokeWidth={1.8} />
        </span>
        <h1 className={w.title}>
          {standalone ? 'Pictur’Art est installée' : 'Mets Pictur’Art sur ton écran d’accueil'}
        </h1>
        <p className={styles.lead}>
          {standalone
            ? 'Plus qu’à activer les notifications pour ne rien rater.'
            : 'Comme une vraie app, sans passer par un store. Ça prend 10 secondes.'}
        </p>
      </section>

      {iosBrowser && (
        <ol className={w.steps}>
          <li>
            <span className={w.number}>01</span>
            <span className={w.stepText}>
              Appuie sur <strong>Partager</strong>
            </span>
            <Share size={22} strokeWidth={1.8} aria-hidden="true" />
          </li>
          <li>
            <span className={w.number}>02</span>
            <span className={w.stepText}>
              Choisis <strong>Sur l’écran d’accueil</strong>
            </span>
            <SquarePlus size={22} strokeWidth={1.8} aria-hidden="true" />
          </li>
          <li>
            <span className={w.number}>03</span>
            <span className={w.stepText}>Ouvre Pictur’Art depuis l’icône</span>
          </li>
        </ol>
      )}

      {!standalone && install.available && (
        <button type="button" className={ui.buttonSecondary} onClick={() => void install.prompt()}>
          <Download size={20} strokeWidth={1.8} aria-hidden="true" />
          Installer l’app
        </button>
      )}

      <section className={w.notifs}>
        <Bell size={26} strokeWidth={1.8} aria-hidden="true" className={w.notifsIcon} />
        <div>
          <h2 className={w.notifsTitle}>Active les notifs</h2>
          <p className={w.notifsText}>
            Pour savoir quand la bande poste ou réagit à tes photos. Promis, on regroupe : pas 17
            notifs pour 17 photos.
          </p>
          {push.state === 'needs-install' && (
            <p className={w.notifsText}>
              Sur iPhone, ça marche une fois l’app installée : on te le reproposera en l’ouvrant
              depuis l’icône.
            </p>
          )}
          {push.state === 'denied' && (
            <p className={w.notifsText}>
              Les notifications sont bloquées pour Pictur’Art : réactive-les dans les réglages du
              téléphone ou du navigateur.
            </p>
          )}
        </div>
      </section>

      <div className={w.actions}>
        {canActivate ? (
          <>
            <button
              type="button"
              className={ui.button}
              onClick={() => void activate()}
              disabled={push.busy}
            >
              {push.busy ? 'Activation…' : 'Activer les notifications'}
            </button>
            <button type="button" className={ui.linkButton} onClick={leave}>
              Plus tard
            </button>
          </>
        ) : (
          <button type="button" className={ui.button} onClick={leave}>
            {iosBrowser ? 'C’est noté, on y va' : 'C’est parti'}
          </button>
        )}
      </div>
    </main>
  );
}
