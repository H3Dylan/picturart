import { ACCEPTED_IMAGE_TYPES, MAX_FILES_PER_POST } from '@picturart/shared';
import { useQueryClient } from '@tanstack/react-query';
import { Camera, ImagePlus, X } from 'lucide-react';
import {
  type ChangeEvent,
  type FormEvent,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import ui from '../components/ui.module.css';
import { ApiError } from '../lib/api.ts';
import { avatarColor } from '../lib/format.ts';
import { keys, useCreatePost, useEvents } from '../lib/queries.ts';
import { startUploads } from '../lib/uploads.ts';
import np from './NewPostPage.module.css';
import styles from './pages.module.css';

interface Picked {
  file: File;
  preview: string;
}

export function NewPostPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const client = useQueryClient();
  const events = useEvents();
  const create = useCreatePost();
  const inputRef = useRef<HTMLInputElement>(null);
  const captionId = useId();
  const [picked, setPicked] = useState<Picked[]>([]);
  const [caption, setCaption] = useState('');
  const [rejected, setRejected] = useState(0);

  const postable = useMemo(
    () => (events.data ?? []).filter((event) => event.role !== 'viewer'),
    [events.data],
  );
  const [eventId, setEventId] = useState(params.get('evenement') ?? '');
  const selectedEvent = postable.find((e) => e.id === eventId) ?? postable[0];

  // Libère les aperçus quand on quitte l'écran
  const pickedRef = useRef(picked);
  pickedRef.current = picked;
  useEffect(
    () => () => {
      for (const p of pickedRef.current) URL.revokeObjectURL(p.preview);
    },
    [],
  );

  function onFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    const accepted = files.filter((f) =>
      (ACCEPTED_IMAGE_TYPES as readonly string[]).includes(f.type),
    );
    setRejected(files.length - accepted.length);
    setPicked((current) =>
      [...current, ...accepted.map((file) => ({ file, preview: URL.createObjectURL(file) }))].slice(
        0,
        MAX_FILES_PER_POST,
      ),
    );
    event.target.value = '';
  }

  function removeAt(index: number) {
    const removed = picked[index];
    if (removed) URL.revokeObjectURL(removed.preview);
    setPicked((current) => current.filter((_, i) => i !== index));
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!selectedEvent || picked.length === 0) return;
    const files = picked.map((p) => p.file);
    create.mutate(
      {
        eventId: selectedEvent.id,
        caption,
        files: files.map((f) => ({
          name: f.name,
          size: f.size,
          type: f.type as (typeof ACCEPTED_IMAGE_TYPES)[number],
        })),
      },
      {
        onSuccess: (post) => {
          startUploads(post, files, () => {
            client.invalidateQueries({ queryKey: keys.posts(post.eventId) });
            client.invalidateQueries({ queryKey: keys.event(post.eventId) });
          });
          client.invalidateQueries({ queryKey: keys.posts(post.eventId) });
          navigate(`/evenements/${post.eventId}`);
        },
      },
    );
  }

  const fieldErrors = create.error instanceof ApiError ? create.error.fields : {};
  const totalMb = picked.reduce((sum, p) => sum + p.file.size, 0) / 1024 / 1024;

  if (events.data && postable.length === 0) {
    return (
      <main className={`${styles.screen} ${styles.withNav}`}>
        <h1 className={ui.pageTitle}>Nouveau post</h1>
        <p className={styles.lead}>
          Crée d'abord un événement, ou demande à rejoindre celui de la bande.
        </p>
        <Link to="/evenements" className={ui.button}>
          Mes événements
        </Link>
      </main>
    );
  }

  return (
    <main className={`${styles.screen} ${styles.withNav}`}>
      <header className={styles.header} style={{ alignItems: 'center' }}>
        <Link
          to={selectedEvent ? `/evenements/${selectedEvent.id}` : '/evenements'}
          className={ui.linkButton}
          style={{ color: 'var(--ink)' }}
        >
          Annuler
        </Link>
        <h1 style={{ margin: 0, fontWeight: 700, fontSize: 18 }}>Nouveau post</h1>
        <span style={{ width: 56 }} />
      </header>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_IMAGE_TYPES.join(',')}
        multiple
        onChange={onFiles}
        className={ui.visuallyHidden}
        tabIndex={-1}
        aria-hidden="true"
      />

      <form className={styles.stack} onSubmit={submit} noValidate>
        {picked.length === 0 ? (
          <button type="button" className={np.picker} onClick={() => inputRef.current?.click()}>
            <ImagePlus size={32} strokeWidth={1.6} aria-hidden="true" />
            <span className={np.pickerTitle}>Choisir des photos</span>
            <span className={styles.lead} style={{ fontSize: 13 }}>
              En qualité originale · {MAX_FILES_PER_POST} maximum
            </span>
          </button>
        ) : (
          <div>
            <ul className={np.grid}>
              {picked.map((p, index) => (
                <li key={p.preview} className={np.thumb}>
                  <img src={p.preview} alt="" className={np.img} />
                  <button
                    type="button"
                    className={np.remove}
                    onClick={() => removeAt(index)}
                    aria-label={`Retirer ${p.file.name}`}
                  >
                    <X size={14} strokeWidth={2.4} />
                  </button>
                </li>
              ))}
              {picked.length < MAX_FILES_PER_POST && (
                <li>
                  <button
                    type="button"
                    className={np.add}
                    onClick={() => inputRef.current?.click()}
                    aria-label="Ajouter des photos"
                  >
                    <ImagePlus size={22} strokeWidth={1.8} />
                  </button>
                </li>
              )}
            </ul>
            <div className={np.summary}>
              <span>
                {picked.length} {picked.length > 1 ? 'photos' : 'photo'}
              </span>
              <span className={ui.meta} style={{ letterSpacing: 1 }}>
                Originaux · {totalMb < 1 ? '< 1' : Math.round(totalMb)} Mo
              </span>
            </div>
          </div>
        )}

        {rejected > 0 && (
          <p className={ui.formError}>
            {rejected} fichier{rejected > 1 ? 's' : ''} ignoré{rejected > 1 ? 's' : ''} : les vidéos
            et certains formats arrivent bientôt.
          </p>
        )}

        <div className={ui.field}>
          <label htmlFor={captionId} className={ui.label}>
            Légende <span className={ui.hint}>· facultative</span>
          </label>
          <textarea
            id={captionId}
            rows={3}
            className={ui.textarea}
            value={caption}
            maxLength={500}
            onChange={(e) => setCaption(e.target.value)}
            placeholder="Raconte le moment…"
          />
          {fieldErrors.caption && <p className={ui.fieldError}>{fieldErrors.caption}</p>}
        </div>

        <fieldset className={np.events}>
          <legend className={ui.label}>Dans l'événement</legend>
          {postable.map((event) => (
            <label key={event.id} className={np.eventRow}>
              <input
                type="radio"
                name="event"
                value={event.id}
                checked={selectedEvent?.id === event.id}
                onChange={() => setEventId(event.id)}
                className={ui.visuallyHidden}
              />
              <span className={np.eventCover} style={{ background: avatarColor(event.id) }} />
              <span className={np.eventName}>{event.name}</span>
              <span className={np.radio} aria-hidden="true" />
            </label>
          ))}
        </fieldset>

        {create.error && !Object.keys(fieldErrors).length && (
          <p className={ui.formError} role="alert">
            {create.error.message}
          </p>
        )}

        <button
          type="submit"
          className={ui.button}
          disabled={picked.length === 0 || !selectedEvent || create.isPending}
        >
          <Camera size={22} strokeWidth={1.8} aria-hidden="true" />
          {create.isPending
            ? 'Préparation…'
            : `Développer${picked.length ? ` · ${picked.length} ${picked.length > 1 ? 'photos' : 'photo'}` : ''}`}
        </button>
      </form>
    </main>
  );
}
