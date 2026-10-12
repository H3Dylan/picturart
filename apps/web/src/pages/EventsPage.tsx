import { type EventSummary, ROLE_LABELS } from '@picturart/shared';
import { ChevronRight, Plus } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { Link } from 'react-router';
import { TextField } from '../components/TextField.tsx';
import ui from '../components/ui.module.css';
import { ApiError } from '../lib/api.ts';
import { avatarColor, formatEventDates } from '../lib/format.ts';
import { useCreateEvent, useEvents } from '../lib/queries.ts';
import ev from './EventsPage.module.css';
import styles from './pages.module.css';

export function EventsPage() {
  const events = useEvents();
  const [creating, setCreating] = useState(false);
  const count = events.data?.length ?? 0;

  return (
    <main className={`${styles.screen} ${styles.withNav}`}>
      <header className={styles.header}>
        <div>
          <p className={ui.meta}>
            {count} {count > 1 ? 'événements' : 'événement'}
          </p>
          <h1 className={ui.pageTitle}>Événements</h1>
        </div>
        <button
          type="button"
          className={`${ui.button} ${ui.buttonSmall}`}
          style={{ background: 'var(--chip-active-bg)', color: 'var(--chip-active-fg)' }}
          onClick={() => setCreating((v) => !v)}
          aria-expanded={creating}
        >
          <Plus size={16} strokeWidth={2.4} aria-hidden="true" />
          Nouveau
        </button>
      </header>

      {creating && <CreateEventForm onDone={() => setCreating(false)} />}

      {events.isError && <p className={ui.formError}>{events.error.message}</p>}

      {events.data && count === 0 && !creating && (
        <section className={ui.card} style={{ padding: 18 }}>
          <p className={styles.lead}>
            Ta pellicule est vide : crée ton premier événement, puis invite la bande.
          </p>
        </section>
      )}

      <ul className={ev.list}>
        {events.data?.map((event) => (
          <EventCard key={event.id} event={event} />
        ))}
      </ul>
    </main>
  );
}

function EventCard({ event }: { event: EventSummary }) {
  const meta = [formatEventDates(event.startsOn, event.endsOn), event.location]
    .filter(Boolean)
    .join(' · ');

  return (
    <li>
      <Link to={`/evenements/${event.id}`} className={`${ui.card} ${ev.card} ${ev.row} ${ev.link}`}>
        <span
          className={ev.cover}
          style={{ background: avatarColor(event.id) }}
          aria-hidden="true"
        />
        <span className={ev.info}>
          <span className={ev.name}>{event.name}</span>
          {meta && <span className={ui.metaAccent}>{meta}</span>}
          <span className={ev.stats}>
            {event.memberCount} {event.memberCount > 1 ? 'potes' : 'pote'} ·{' '}
            {ROLE_LABELS[event.role]}
          </span>
        </span>
        <ChevronRight size={20} strokeWidth={1.8} aria-hidden="true" />
      </Link>
    </li>
  );
}

function CreateEventForm({ onDone }: { onDone: () => void }) {
  const create = useCreateEvent();
  const [form, setForm] = useState({ name: '', startsOn: '', endsOn: '', location: '' });
  const errors = create.error instanceof ApiError ? create.error.fields : {};
  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  function submit(event: FormEvent) {
    event.preventDefault();
    create.mutate(
      {
        name: form.name,
        ...(form.startsOn && { startsOn: form.startsOn }),
        ...(form.endsOn && { endsOn: form.endsOn }),
        ...(form.location && { location: form.location }),
      },
      { onSuccess: onDone },
    );
  }

  return (
    <form className={`${ui.card} ${styles.stack} ${ev.form}`} onSubmit={submit} noValidate>
      <TextField
        label="Nom de l'événement"
        value={form.name}
        onChange={set('name')}
        error={errors.name}
        autoFocus
      />
      <div className={ev.dates}>
        <TextField
          label="Du"
          type="date"
          value={form.startsOn}
          onChange={set('startsOn')}
          error={errors.startsOn}
        />
        <TextField
          label="Au"
          type="date"
          value={form.endsOn}
          onChange={set('endsOn')}
          error={errors.endsOn}
        />
      </div>
      <TextField
        label="Lieu"
        hint="facultatif"
        value={form.location}
        onChange={set('location')}
        error={errors.location}
      />
      <button type="submit" className={ui.button} disabled={create.isPending}>
        {create.isPending ? 'Création…' : 'Créer l’événement'}
      </button>
    </form>
  );
}
