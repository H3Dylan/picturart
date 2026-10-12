import { type MediaKind, mediaUrl, type ReactionEmoji } from '@picturart/shared';
import { ChevronLeft, ChevronRight, Download, MessageCircle, X } from 'lucide-react';
import { type PointerEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { Avatar } from '../components/Avatar.tsx';
import { applyReaction, ReactionBar } from '../components/ReactionBar.tsx';
import ui from '../components/ui.module.css';
import { timeAgo } from '../lib/format.ts';
import { usePlanche, usePost, useReact } from '../lib/queries.ts';
import { useDoubleTap } from '../lib/useDoubleTap.ts';
import v from './ViewerPage.module.css';

interface Item {
  mediaId: string;
  postId: string;
  kind: MediaKind;
}

/** Visionneuse d'un post : /posts/:postId/photos/:index */
export function PostViewerPage() {
  const { postId = '', index = '0' } = useParams();
  const post = usePost(postId);
  const items = useMemo<Item[]>(
    () =>
      (post.data?.media ?? [])
        .filter((m) => m.status === 'ready')
        .map((m) => ({ mediaId: m.id, postId, kind: m.kind })),
    [post.data, postId],
  );
  return (
    <Viewer
      items={items}
      index={Number(index)}
      loading={post.isPending}
      hrefFor={(i) => `/posts/${postId}/photos/${i}`}
    />
  );
}

/** Visionneuse de la planche d'un événement : /evenements/:eventId/photos/:index */
export function PlancheViewerPage() {
  const { eventId = '', index = '0' } = useParams();
  const [params] = useSearchParams();
  const best = params.get('tri') === 'meilleures';
  const planche = usePlanche(eventId, best);
  const items = useMemo<Item[]>(
    () => (planche.data ?? []).map((p) => ({ mediaId: p.mediaId, postId: p.postId, kind: p.kind })),
    [planche.data],
  );
  return (
    <Viewer
      items={items}
      index={Number(index)}
      loading={planche.isPending}
      hrefFor={(i) => `/evenements/${eventId}/photos/${i}${best ? '?tri=meilleures' : ''}`}
    />
  );
}

interface ViewerProps {
  items: Item[];
  index: number;
  loading: boolean;
  hrefFor: (index: number) => string;
}

function Viewer({ items, index, loading, hrefFor }: ViewerProps) {
  const navigate = useNavigate();
  const current = items[index];
  const video = current?.kind === 'video';
  const post = usePost(current?.postId);
  const media = post.data?.media.find((m) => m.id === current?.mediaId);
  const [heart, setHeart] = useState(0);
  const [reactions, setReactions] = useState(media?.reactions);
  const react = useReact({
    kind: 'media',
    id: current?.mediaId ?? '',
    postId: current?.postId ?? '',
    eventId: post.data?.eventId ?? '',
  });

  // Les données du serveur font foi dès qu'elles changent
  const [seen, setSeen] = useState(media?.reactions);
  if (seen !== media?.reactions) {
    setSeen(media?.reactions);
    setReactions(media?.reactions);
  }

  const go = useCallback(
    (to: number) => {
      if (to >= 0 && to < items.length) navigate(hrefFor(to), { replace: true });
    },
    [items.length, navigate, hrefFor],
  );

  const close = useCallback(() => {
    if (window.history.length > 1) navigate(-1);
    else navigate('/fil');
  }, [navigate]);

  // Clavier : flèches et Échap
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      // Sur le lecteur vidéo, les flèches avancent dans la vidéo
      if (event.target instanceof HTMLVideoElement && event.key !== 'Escape') return;
      if (event.key === 'ArrowRight') go(index + 1);
      else if (event.key === 'ArrowLeft') go(index - 1);
      else if (event.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go, index, close]);

  // Préchargement des photos voisines
  useEffect(() => {
    for (const neighbour of [items[index - 1], items[index + 1]]) {
      if (neighbour) new Image().src = mediaUrl(neighbour.mediaId, 'display');
    }
  }, [items, index]);

  function onReact(emoji: ReactionEmoji | null) {
    setReactions((r) => (r ? applyReaction(r, emoji) : r));
    react.mutate(emoji, { onSuccess: setReactions });
  }

  const tap = useDoubleTap(
    () => {},
    () => {
      setHeart((n) => n + 1);
      if (reactions?.mine !== '❤️') onReact('❤️');
    },
  );

  // Glisser pour changer de photo
  const start = useRef<number | null>(null);
  const onPointerDown = (event: PointerEvent) => {
    // Vidéo : le bas de l'image appartient aux commandes du lecteur (barre de lecture)
    if (event.target instanceof HTMLVideoElement) {
      const rect = event.target.getBoundingClientRect();
      if (event.clientY > rect.top + rect.height * 0.7) {
        start.current = null;
        return;
      }
    }
    start.current = event.clientX;
  };
  const onPointerUp = (event: PointerEvent) => {
    // Les flèches gèrent leur propre clic : pas de ❤️ en double-cliquant dessus
    if (start.current === null || (event.target as HTMLElement).closest('button')) return;
    const dx = event.clientX - start.current;
    start.current = null;
    if (Math.abs(dx) > 60) go(index + (dx < 0 ? 1 : -1));
    // Sur une vidéo, un appui sert au lecteur (lecture, pause)
    else if (!video) tap();
  };

  return (
    <main className={v.viewer}>
      <header className={v.top}>
        <button type="button" className={v.round} onClick={close} aria-label="Fermer">
          <X size={20} strokeWidth={2} />
        </button>
        <span className={v.counter}>
          {items.length
            ? `${String(index + 1).padStart(2, '0')} / ${String(items.length).padStart(2, '0')}`
            : ''}
        </span>
        {current ? (
          <a
            href={mediaUrl(current.mediaId, 'original')}
            download
            className={v.round}
            aria-label="Télécharger l’original"
          >
            <Download size={20} strokeWidth={1.8} />
          </a>
        ) : (
          <span className={v.round} />
        )}
      </header>

      <section
        className={v.stage}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        aria-label={
          video ? 'Vidéo : glisse pour changer' : 'Photo : glisse pour changer, double appui pour ❤️'
        }
      >
        {current && video && (
          // Version de lecture 1080p (H.264, SDR) : lisible partout, l'original reste téléchargeable.
          // biome-ignore lint/a11y/useMediaCaption: vidéos perso de la bande, sans piste de sous-titres
          <video
            key={current.mediaId}
            src={mediaUrl(current.mediaId, 'video')}
            poster={mediaUrl(current.mediaId, 'display')}
            className={v.photo}
            controls
            playsInline
            preload="metadata"
          />
        )}
        {current && !video && (
          <img
            key={current.mediaId}
            src={mediaUrl(current.mediaId, 'display')}
            alt={post.data?.caption ? `Photo : ${post.data.caption}` : 'Photo'}
            className={v.photo}
            draggable={false}
          />
        )}
        {!current && !loading && <p className={v.empty}>Cette photo n'est plus disponible.</p>}
        {heart > 0 && (
          <span key={heart} className={v.heart} aria-hidden="true">
            ❤️
          </span>
        )}
        {index > 0 && (
          <button
            type="button"
            className={`${v.arrow} ${v.prev}`}
            onClick={() => go(index - 1)}
            aria-label="Photo précédente"
          >
            <ChevronLeft size={24} />
          </button>
        )}
        {index < items.length - 1 && (
          <button
            type="button"
            className={`${v.arrow} ${v.next}`}
            onClick={() => go(index + 1)}
            aria-label="Photo suivante"
          >
            <ChevronRight size={24} />
          </button>
        )}
      </section>

      {post.data && (
        <footer className={v.bottom}>
          <div className={v.author}>
            <Avatar id={post.data.author.id} name={post.data.author.displayName} size={34} />
            <div>
              <div className={v.name}>{post.data.author.displayName}</div>
              <div className={v.meta}>
                {post.data.event.name} · {timeAgo(post.data.createdAt)}
              </div>
            </div>
          </div>
          {post.data.caption && <p className={v.caption}>{post.data.caption}</p>}
          <div className={v.actions}>
            {reactions && <ReactionBar reactions={reactions} onReact={onReact} onDark />}
            <Link to={`/posts/${post.data.id}/commentaires`} className={v.comments}>
              <MessageCircle size={18} strokeWidth={1.8} aria-hidden="true" />
              {post.data.commentCount}
              <span className={ui.visuallyHidden}> commentaires</span>
            </Link>
          </div>
        </footer>
      )}
    </main>
  );
}
