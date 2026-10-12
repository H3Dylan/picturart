import type { CommentDto } from '@picturart/shared';
import { ArrowRight, X } from 'lucide-react';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Avatar } from '../components/Avatar.tsx';
import ui from '../components/ui.module.css';
import { ApiError } from '../lib/api.ts';
import { timeAgo } from '../lib/format.ts';
import { useAddComment, useComments, useDeleteComment, useMe, usePost } from '../lib/queries.ts';
import c from './CommentsPage.module.css';

export function CommentsPage() {
  const { postId = '' } = useParams();
  const navigate = useNavigate();
  const { data: me } = useMe();
  const post = usePost(postId);
  const comments = useComments(postId);
  const add = useAddComment(postId);
  const remove = useDeleteComment(postId);
  const [body, setBody] = useState('');
  const listEnd = useRef<HTMLLIElement>(null);
  const count = comments.data?.length ?? 0;

  // Reste en bas de la conversation quand un commentaire arrive
  useEffect(() => {
    if (count) listEnd.current?.scrollIntoView({ block: 'end' });
  }, [count]);

  function send(event: FormEvent) {
    event.preventDefault();
    if (!body.trim()) return;
    add.mutate(body, { onSuccess: () => setBody('') });
  }

  const close = () => (window.history.length > 1 ? navigate(-1) : navigate('/fil'));
  const error = add.error instanceof ApiError ? (add.error.fields.body ?? add.error.message) : null;

  return (
    <main className={c.page}>
      <header className={c.header}>
        <h1 className={c.title}>
          Commentaires <span className={c.count}>· {count}</span>
        </h1>
        <button
          type="button"
          className={ui.iconButton}
          style={{ border: 'none' }}
          onClick={close}
          aria-label="Fermer"
        >
          <X size={20} strokeWidth={2} />
        </button>
      </header>
      {post.data?.caption && (
        <p className={c.context}>
          <strong>{post.data.author.displayName}</strong> {post.data.caption}
        </p>
      )}

      <ul className={c.list}>
        {comments.data?.length === 0 && (
          <li className={c.empty}>Personne n'a encore commenté. Lance la conversation.</li>
        )}
        {comments.data?.map((comment) => (
          <CommentRow
            key={comment.id}
            comment={comment}
            mine={comment.author.id === me?.id}
            onDelete={() => remove.mutate(comment.id)}
          />
        ))}
        <li ref={listEnd} aria-hidden="true" />
      </ul>

      <form className={c.composer} onSubmit={send}>
        {me && <Avatar id={me.id} name={me.displayName} size={34} />}
        <label htmlFor="comment" className={ui.visuallyHidden}>
          Ajouter un commentaire
        </label>
        <input
          id="comment"
          className={c.input}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Ajoute ton grain de sel…"
          maxLength={1000}
          autoComplete="off"
          enterKeyHint="send"
        />
        <button
          type="submit"
          className={c.send}
          disabled={!body.trim() || add.isPending}
          aria-label="Envoyer"
        >
          <ArrowRight size={20} strokeWidth={2} />
        </button>
      </form>
      {error && <p className={`${ui.fieldError} ${c.error}`}>{error}</p>}
    </main>
  );
}

function CommentRow({
  comment,
  mine,
  onDelete,
}: {
  comment: CommentDto;
  mine: boolean;
  onDelete: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  return (
    <li className={c.row}>
      <Avatar id={comment.author.id} name={comment.author.displayName} size={34} />
      <div className={c.bubble}>
        <div className={c.meta}>
          <span className={c.author}>{comment.author.displayName}</span>
          <span className={c.time}>{timeAgo(comment.createdAt)}</span>
        </div>
        <p className={c.body}>{comment.body}</p>
        {mine &&
          (confirming ? (
            <span className={c.actions}>
              <button type="button" className={ui.linkButton} onClick={() => setConfirming(false)}>
                Garder
              </button>
              <button type="button" className={ui.linkButton} onClick={onDelete}>
                Supprimer pour de bon
              </button>
            </span>
          ) : (
            <button
              type="button"
              className={`${ui.linkButton} ${c.small}`}
              onClick={() => setConfirming(true)}
            >
              Supprimer
            </button>
          ))}
      </div>
    </li>
  );
}
