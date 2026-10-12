import { Camera } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router';
import { FilmStrip } from '../components/FilmStrip.tsx';
import ui from '../components/ui.module.css';
import { formatEventDates } from '../lib/format.ts';
import { useAcceptInvite, useInvite, useMe } from '../lib/queries.ts';
import styles from './pages.module.css';
import { Splash } from './Splash.tsx';

export function InvitePage() {
  const { token = '' } = useParams();
  const navigate = useNavigate();
  const { data: me } = useMe();
  const invite = useInvite(token);
  const accept = useAcceptInvite(token);

  if (invite.isPending) return <Splash />;

  if (invite.isError) {
    return (
      <main className={styles.screen}>
        <Brand />
        <div className={styles.stack}>
          <h1 className={ui.pageTitle}>Lien périmé</h1>
          <p className={styles.lead}>{invite.error.message}</p>
        </div>
        <div className={styles.actions}>
          <Link to="/connexion" className={ui.buttonSecondary}>
            J'ai déjà un compte
          </Link>
        </div>
      </main>
    );
  }

  const { event, invitedBy, alreadyMember } = invite.data;
  const dates = formatEventDates(event.startsOn, event.endsOn);
  const meta = [dates, event.location].filter(Boolean).join(' · ');

  function join() {
    accept.mutate(undefined, { onSuccess: () => navigate('/evenements') });
  }

  return (
    <main className={styles.screen}>
      <Brand />

      <section className={ui.card} style={{ overflow: 'hidden' }}>
        <FilmStrip count={3} />
        <div className={styles.stack} style={{ padding: 18, gap: 10 }}>
          <p className={styles.lead}>
            <span className={styles.strong}>{invitedBy.displayName}</span> t'invite dans
          </p>
          <h1 className={ui.pageTitle}>{event.name}</h1>
          {meta && <p className={ui.metaAccent}>{meta}</p>}
          <p className={styles.lead}>
            {event.memberCount} {event.memberCount > 1 ? 'potes' : 'pote'} déjà dedans
          </p>
        </div>
      </section>

      <div className={styles.actions}>
        {accept.error && (
          <p className={ui.formError} role="alert">
            {accept.error.message}
          </p>
        )}
        {me && alreadyMember && (
          <Link to="/evenements" className={ui.button}>
            Ouvrir l'événement
          </Link>
        )}
        {me && !alreadyMember && (
          <button type="button" className={ui.button} onClick={join} disabled={accept.isPending}>
            {accept.isPending ? 'Un instant…' : `Rejoindre en tant que ${me.displayName}`}
          </button>
        )}
        {!me && (
          <>
            <Link to={`/i/${token}/inscription`} className={ui.button}>
              Rejoindre la bande
            </Link>
            <Link
              to={`/connexion?next=${encodeURIComponent(`/i/${token}`)}`}
              className={ui.linkButton}
            >
              J'ai déjà un compte · Se connecter
            </Link>
          </>
        )}
        <p className={ui.meta}>Réseau privé · sur invitation uniquement</p>
      </div>
    </main>
  );
}

function Brand() {
  return (
    <header className={styles.headerRow} style={{ justifyContent: 'center' }}>
      <Camera size={22} strokeWidth={1.8} aria-hidden="true" />
      <span style={{ fontWeight: 700, fontSize: 20 }}>Pictur'Art</span>
    </header>
  );
}
