import {
  actorName,
  describeNotification,
  mediaUrl,
  type NotificationDto,
  notificationLink,
} from '@picturart/shared';
import { useEffect, useRef } from 'react';
import { Link } from 'react-router';
import { Avatar } from '../components/Avatar.tsx';
import { FilmStrip } from '../components/FilmStrip.tsx';
import ui from '../components/ui.module.css';
import { timeAgo } from '../lib/format.ts';
import { useMarkRead, useNotifications } from '../lib/queries.ts';
import a from './ActivityPage.module.css';
import styles from './pages.module.css';

const DAY = 86_400_000;

/** « IL Y A 2 H » aujourd'hui, puis « MAR. 08.10 » : métadonnée façon pellicule. */
function stamp(iso: string, now: number) {
  const date = new Date(iso);
  if (now - date.getTime() < DAY) return timeAgo(iso, now).toUpperCase();
  const day = date.toLocaleDateString('fr-FR', { weekday: 'short' }).toUpperCase();
  const dm = `${String(date.getDate()).padStart(2, '0')}.${String(date.getMonth() + 1).padStart(2, '0')}`;
  return `${day} ${dm}`;
}

function groupOf(iso: string, now: Date) {
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const time = new Date(iso).getTime();
  if (time >= startOfToday) return "Aujourd'hui";
  if (time >= startOfToday - 6 * DAY) return 'Cette semaine';
  return 'Plus tôt';
}

export function ActivityPage() {
  const notifications = useNotifications();
  const markRead = useMarkRead();
  const sentinel = useRef<HTMLDivElement>(null);
  const pages = notifications.data?.pages ?? [];
  const items = pages.flatMap((page) => page.items);
  const unread = pages[0]?.unread ?? 0;
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = notifications;
  const now = new Date();

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

  const groups = new Map<string, NotificationDto[]>();
  for (const item of items) {
    const title = groupOf(item.createdAt, now);
    groups.set(title, [...(groups.get(title) ?? []), item]);
  }

  return (
    <main className={`${styles.screen} ${styles.withNav}`}>
      <header className={styles.header} style={{ alignItems: 'flex-end' }}>
        <div>
          <p className={ui.meta}>
            {unread ? `${unread} NON LUE${unread > 1 ? 'S' : ''}` : 'TOUT EST LU'}
          </p>
          <h1 className={ui.pageTitle}>Activité</h1>
        </div>
        {unread > 0 && (
          <button
            type="button"
            className={ui.linkButton}
            onClick={() => markRead.mutate(undefined)}
            disabled={markRead.isPending}
          >
            Tout marquer lu
          </button>
        )}
      </header>

      {notifications.isPending && <p className={styles.lead}>Chargement…</p>}

      {notifications.data && items.length === 0 && (
        <div className={styles.stack} style={{ gap: 12 }}>
          <FilmStrip />
          <p className={styles.lead}>
            Rien pour l'instant. Dès que la bande poste, réagit ou commente, ça arrive ici.
          </p>
        </div>
      )}

      {[...groups].map(([title, list]) => (
        <section key={title} className={a.group}>
          <h2 className={a.groupTitle}>{title}</h2>
          <ul className={a.list}>
            {list.map((n) => (
              <li key={n.id}>
                <Link
                  to={notificationLink(n)}
                  className={a.row}
                  onClick={() => {
                    if (!n.read) markRead.mutate([n.id]);
                  }}
                >
                  <span className={a.avatar}>
                    {n.actor ? (
                      <Avatar id={n.actor.id} name={n.actor.displayName} size={40} />
                    ) : (
                      <span className={a.memory} aria-hidden="true">
                        ★
                      </span>
                    )}
                    {!n.read && <span className={a.unread} />}
                  </span>
                  <span className={a.text}>
                    <strong>{actorName(n)}</strong> {describeNotification(n)}
                    {!n.read && <span className={ui.visuallyHidden}> (non lue)</span>}
                    <span className={a.when}>{stamp(n.createdAt, now.getTime())}</span>
                  </span>
                  {n.mediaId ? (
                    <img
                      src={mediaUrl(n.mediaId, 'thumb')}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      className={a.thumb}
                    />
                  ) : (
                    n.postId && <span className={a.thumb} aria-hidden="true" />
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
      <div ref={sentinel} />
    </main>
  );
}
