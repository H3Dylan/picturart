import { mediaUrl } from '@picturart/shared';
import { ChevronLeft } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { Avatar } from '../components/Avatar.tsx';
import { ReactionGlyph } from '../components/ReactionBar.tsx';
import ui from '../components/ui.module.css';
import { VideoBadge } from '../components/VideoBadge.tsx';
import { useProfile, useProfileMedia } from '../lib/queries.ts';
import f from './FriendProfilePage.module.css';
import styles from './pages.module.css';
import { Splash } from './Splash.tsx';

/** « DANS LA BANDE DEPUIS MARS 2026 » */
function since(iso: string) {
  return new Date(iso)
    .toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
    .toUpperCase();
}

/** Tampon de date façon pellicule : '26 10 11 */
function stamp(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `'${String(d.getFullYear()).slice(2)} ${pad(d.getMonth() + 1)} ${pad(d.getDate())}`;
}

/** Profil d'un pote : stats sur ce qu'on partage, événements en commun, ses photos. */
export function FriendProfilePage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const profile = useProfile(id);
  const grid = useProfileMedia(id);
  const sentinel = useRef<HTMLDivElement>(null);
  const items = grid.data?.pages.flatMap((page) => page.items) ?? [];
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = grid;

  useEffect(() => {
    const node = sentinel.current;
    if (!node || !hasNextPage) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !isFetchingNextPage) fetchNextPage();
      },
      { rootMargin: '400px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const back = () => (window.history.length > 1 ? navigate(-1) : navigate('/fil'));

  if (profile.isPending) return <Splash />;
  if (profile.isError) {
    return (
      <main className={`${styles.screen} ${styles.withNav}`}>
        <h1 className={ui.pageTitle}>Profil introuvable</h1>
        <p className={styles.lead}>On ne partage aucun événement avec cette personne.</p>
      </main>
    );
  }

  const p = profile.data;
  return (
    <main className={`${styles.screen} ${styles.withNav}`}>
      <header className={styles.header} style={{ alignItems: 'center' }}>
        <button type="button" className={ui.iconButton} onClick={back} aria-label="Retour">
          <ChevronLeft size={20} strokeWidth={1.8} />
        </button>
        <p className={ui.meta}>DANS LA BANDE DEPUIS {since(p.memberSince)}</p>
      </header>

      <section className={f.identity}>
        <span className={f.avatar}>
          <Avatar id={p.id} name={p.displayName} size={84} />
        </span>
        <div style={{ minWidth: 0 }}>
          <h1 className={f.name}>{p.displayName}</h1>
          {p.bio && <p className={f.bio}>{p.bio}</p>}
        </div>
      </section>

      <dl className={f.stats}>
        <div>
          <dt>POSTS</dt>
          <dd>{p.stats.posts}</dd>
        </div>
        <div>
          <dt>RÉACTIONS</dt>
          <dd>{p.stats.reactionsReceived}</dd>
        </div>
        <div>
          <dt>LE + REÇU</dt>
          <dd className={f.top}>
            {p.stats.topReaction ? <ReactionGlyph reaction={p.stats.topReaction} size={30} /> : '—'}
          </dd>
        </div>
      </dl>

      <section className={styles.stack} style={{ gap: 8 }}>
        <p className={ui.metaAccent}>ÉVÉNEMENTS EN COMMUN · {p.commonEvents.length}</p>
        <nav aria-label="Événements en commun" className={f.chips}>
          {p.commonEvents.map((e) => (
            <Link key={e.id} to={`/evenements/${e.id}`} className={f.chip}>
              {e.name}
            </Link>
          ))}
        </nav>
      </section>

      {items.length > 0 ? (
        <ul className={f.grid} aria-label={`Photos de ${p.displayName}`}>
          {items.map((m, index) => {
            const day = stamp(m.date);
            const newDay = index === 0 || stamp(items[index - 1]?.date ?? '') !== day;
            return (
              <li key={m.mediaId}>
                <Link
                  to={`/posts/${m.postId}/photos/${m.mediaId}`}
                  className={f.tile}
                  aria-label={`${m.kind === 'video' ? 'Vidéo' : 'Photo'} du ${new Date(m.date).toLocaleDateString('fr-FR')}`}
                >
                  <img
                    src={mediaUrl(m.mediaId, 'thumb')}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className={f.img}
                  />
                  {m.kind === 'video' && <VideoBadge durationMs={m.durationMs} />}
                  {newDay && <span className={f.stamp}>{day}</span>}
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        grid.data && (
          <p className={styles.lead}>Pas encore de photos dans vos événements communs.</p>
        )
      )}
      <div ref={sentinel} />
    </main>
  );
}
