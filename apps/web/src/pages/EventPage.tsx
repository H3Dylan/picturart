import { Camera, ChevronLeft, Users } from 'lucide-react';
import { Link, useParams, useSearchParams } from 'react-router';
import { Avatar } from '../components/Avatar.tsx';
import { Planche } from '../components/Planche.tsx';
import { PostCard } from '../components/PostCard.tsx';
import ui from '../components/ui.module.css';
import { formatEventDates } from '../lib/format.ts';
import { useDeletePost, useEvent, useEventPosts, useMe, usePlanche } from '../lib/queries.ts';
import ev from './EventPage.module.css';
import styles from './pages.module.css';
import { Splash } from './Splash.tsx';

const TABS = [
  { id: 'planche', label: 'Planche' },
  { id: 'posts', label: 'Posts' },
  { id: 'meilleures', label: '★ Meilleures' },
] as const;
type Tab = (typeof TABS)[number]['id'];

export function EventPage() {
  const { id = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const tab: Tab = TABS.find((t) => t.id === params.get('vue'))?.id ?? 'planche';
  const event = useEvent(id);

  if (event.isPending) return <Splash />;
  if (event.isError) {
    return (
      <main className={`${styles.screen} ${styles.withNav}`}>
        <h1 className={ui.pageTitle}>Événement introuvable</h1>
        <p className={styles.lead}>{event.error.message}</p>
        <Link to="/evenements" className={ui.buttonSecondary}>
          Mes événements
        </Link>
      </main>
    );
  }

  const e = event.data;
  const meta = [formatEventDates(e.startsOn, e.endsOn), e.location].filter(Boolean).join(' · ');
  const canPost = e.role !== 'viewer';

  return (
    <main className={`${styles.screen} ${styles.withNav}`}>
      <header className={styles.header} style={{ alignItems: 'center' }}>
        <Link to="/evenements" aria-label="Retour aux événements" className={ui.iconButton}>
          <ChevronLeft size={20} strokeWidth={1.8} />
        </Link>
        <Link
          to={`/evenements/${id}/membres`}
          className={`${ui.buttonSecondary} ${ui.buttonSmall}`}
        >
          <Users size={16} strokeWidth={1.8} aria-hidden="true" />
          {e.role === 'viewer' ? 'Membres' : 'Inviter'}
        </Link>
      </header>

      <section className={styles.stack} style={{ gap: 8 }}>
        {meta && <p className={ui.metaAccent}>{meta}</p>}
        <h1 className={ui.pageTitle} style={{ fontSize: 38 }}>
          {e.name}
        </h1>
        <div className={ev.members}>
          <div className={ev.stack}>
            {e.members.slice(0, 5).map((m) => (
              <span key={m.id} className={ev.ring}>
                <Avatar id={m.id} name={m.displayName} size={30} />
              </span>
            ))}
          </div>
          <span className={styles.lead} style={{ fontSize: 13 }}>
            {e.memberCount} {e.memberCount > 1 ? 'potes' : 'pote'} · {e.photoCount}{' '}
            {e.photoCount > 1 ? 'poses' : 'pose'} · {e.postCount}{' '}
            {e.postCount > 1 ? 'posts' : 'post'}
          </span>
        </div>
      </section>

      <div role="tablist" aria-label="Vue de l’événement" className={ui.segmented}>
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={`${ui.segment} ${ev.tab}`}
            onClick={() => setParams(t.id === 'planche' ? {} : { vue: t.id }, { replace: true })}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div role="tabpanel">
        {tab === 'posts' ? (
          <EventPosts eventId={id} canPost={canPost} />
        ) : (
          <EventPlanche eventId={id} best={tab === 'meilleures'} canPost={canPost} />
        )}
      </div>

      {canPost && (
        <div className={ev.cta}>
          <Link to={`/poster?evenement=${id}`} className={ui.button}>
            <Camera size={22} strokeWidth={1.8} aria-hidden="true" />
            Développer mes photos
          </Link>
        </div>
      )}
    </main>
  );
}

function Empty({ canPost, best }: { canPost: boolean; best?: boolean }) {
  return (
    <section className={ui.card} style={{ padding: 18 }}>
      <p className={styles.lead}>
        {best
          ? 'Aucune photo n’a encore reçu de réaction. Double-appuie sur tes préférées !'
          : `La pellicule est vierge. ${canPost ? 'Développe les premières photos de l’événement.' : 'Rien n’a encore été posté.'}`}
      </p>
    </section>
  );
}

function EventPlanche({
  eventId,
  best,
  canPost,
}: {
  eventId: string;
  best: boolean;
  canPost: boolean;
}) {
  const planche = usePlanche(eventId, best);
  if (planche.isPending) return null;
  if (planche.isError) return <p className={ui.formError}>{planche.error.message}</p>;
  if (planche.data.length === 0) return <Empty canPost={canPost} best={best} />;
  return <Planche items={planche.data} eventId={eventId} best={best} />;
}

function EventPosts({ eventId, canPost }: { eventId: string; canPost: boolean }) {
  const { data: me } = useMe();
  const posts = useEventPosts(eventId);
  const remove = useDeletePost(eventId);
  const all = posts.data?.pages.flatMap((page) => page.posts) ?? [];

  if (posts.data && all.length === 0) return <Empty canPost={canPost} />;
  return (
    <div className={styles.stack} style={{ gap: 14 }}>
      {all.map((post) => (
        <PostCard
          key={post.id}
          post={post}
          isAuthor={post.author.id === me?.id}
          onDelete={() => remove.mutate(post.id)}
          deleting={remove.isPending}
        />
      ))}
      {posts.hasNextPage && (
        <button
          type="button"
          className={ui.buttonSecondary}
          onClick={() => posts.fetchNextPage()}
          disabled={posts.isFetchingNextPage}
        >
          {posts.isFetchingNextPage ? 'Chargement…' : 'Voir les posts plus anciens'}
        </button>
      )}
    </div>
  );
}
