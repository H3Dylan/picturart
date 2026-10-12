import { Camera, ChevronLeft, Users } from 'lucide-react';
import { Link, useParams } from 'react-router';
import { Avatar } from '../components/Avatar.tsx';
import { PostCard } from '../components/PostCard.tsx';
import ui from '../components/ui.module.css';
import { formatEventDates } from '../lib/format.ts';
import { useDeletePost, useEvent, useEventPosts, useMe } from '../lib/queries.ts';
import ev from './EventPage.module.css';
import styles from './pages.module.css';
import { Splash } from './Splash.tsx';

export function EventPage() {
  const { id = '' } = useParams();
  const { data: me } = useMe();
  const event = useEvent(id);
  const posts = useEventPosts(id);
  const remove = useDeletePost(id);

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
  const allPosts = posts.data?.pages.flatMap((page) => page.posts) ?? [];

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

      {posts.data && allPosts.length === 0 && (
        <section className={ui.card} style={{ padding: 18 }}>
          <p className={styles.lead}>
            La pellicule est vierge.{' '}
            {canPost
              ? 'Développe les premières photos de l’événement.'
              : 'Rien n’a encore été posté.'}
          </p>
        </section>
      )}

      <div className={styles.stack} style={{ gap: 14 }}>
        {allPosts.map((post) => (
          <PostCard
            key={post.id}
            post={post}
            isAuthor={post.author.id === me?.id}
            onDelete={() => remove.mutate(post.id)}
            deleting={remove.isPending}
          />
        ))}
      </div>

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
