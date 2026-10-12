import type { PostDto } from '@picturart/shared';
import { Bell } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { Link } from 'react-router';
import { FilmStrip } from '../components/FilmStrip.tsx';
import { NotificationsNudge } from '../components/NotificationsNudge.tsx';
import { PostCard } from '../components/PostCard.tsx';
import ui from '../components/ui.module.css';
import { useDeletePost, useEvents, useFeed, useMe, useUnread } from '../lib/queries.ts';
import feed from './FeedPage.module.css';
import styles from './pages.module.css';

function rollLabel(date: Date) {
  const month = date.toLocaleDateString('fr-FR', { month: 'short' }).replace('.', '');
  const roll = String(date.getMonth() + 1).padStart(3, '0');
  return `ROLL ${roll} · ${month.toUpperCase()} ${date.getFullYear()}`;
}

export function FeedPage() {
  const { data: me } = useMe();
  const events = useEvents();
  const posts = useFeed();
  const unread = useUnread(true).data ?? 0;
  const sentinel = useRef<HTMLDivElement>(null);
  const all = posts.data?.pages.flatMap((page) => page.posts) ?? [];
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = posts;

  // Défilement infini : charge la page suivante à l'approche du bas
  useEffect(() => {
    const node = sentinel.current;
    if (!node || !hasNextPage) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !isFetchingNextPage) fetchNextPage();
      },
      { rootMargin: '600px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  return (
    <main className={`${styles.screen} ${styles.withNav}`}>
      <header className={styles.header}>
        <div>
          <p className={ui.meta}>{rollLabel(new Date())}</p>
          <h1 className={ui.pageTitle}>Pictur'Art</h1>
        </div>
        <Link
          to="/activite"
          aria-label={unread ? `Activité, ${unread} non lue${unread > 1 ? 's' : ''}` : 'Activité'}
          className={`${ui.iconButton} ${feed.bell}`}
        >
          <Bell size={20} strokeWidth={1.8} />
          {unread > 0 && <span className={feed.bellDot} aria-hidden="true" />}
        </Link>
      </header>

      <NotificationsNudge />

      {events.data && events.data.length > 0 && (
        <nav aria-label="Mes événements" className={feed.chips}>
          {events.data.map((event) => (
            <Link key={event.id} to={`/evenements/${event.id}`} className={feed.chip}>
              {event.name}
            </Link>
          ))}
        </nav>
      )}

      {posts.isError && <p className={ui.formError}>{posts.error.message}</p>}

      {posts.data && all.length === 0 && (
        <section className={styles.stack}>
          <FilmStrip count={3} />
          <p className={styles.lead}>
            La pellicule est vierge. Développe tes premières photos ou invite la bande dans un
            événement.
          </p>
          <Link to="/poster" className={ui.button}>
            Développer des photos
          </Link>
        </section>
      )}

      <div className={styles.stack} style={{ gap: 14 }}>
        {all.map((post) => (
          <FeedPostCard key={post.id} post={post} isAuthor={post.author.id === me?.id} />
        ))}
      </div>
      <div ref={sentinel} aria-hidden="true" />
      {isFetchingNextPage && <p className={styles.center}>Chargement…</p>}
    </main>
  );
}

function FeedPostCard({ post, isAuthor }: { post: PostDto; isAuthor: boolean }) {
  const remove = useDeletePost(post.eventId);
  return (
    <PostCard
      post={post}
      isAuthor={isAuthor}
      showEvent
      onDelete={() => remove.mutate(post.id)}
      deleting={remove.isPending}
    />
  );
}
