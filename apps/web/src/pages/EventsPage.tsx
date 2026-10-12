import { type CreatedInvite, type EventSummary, ROLE_LABELS } from '@picturart/shared';
import { Copy, Plus, Share } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { TextField } from '../components/TextField.tsx';
import ui from '../components/ui.module.css';
import { ApiError } from '../lib/api.ts';
import { avatarColor, formatEventDates } from '../lib/format.ts';
import { useCreateEvent, useCreateInvite, useEvents } from '../lib/queries.ts';
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
  const [invite, setInvite] = useState<CreatedInvite | null>(null);
  const createInvite = useCreateInvite();
  const meta = [formatEventDates(event.startsOn, event.endsOn), event.location]
    .filter(Boolean)
    .join(' · ');
  const canInvite = event.role !== 'viewer';

  return (
    <li className={`${ui.card} ${ev.card}`}>
      <div className={ev.row}>
        <span
          className={ev.cover}
          style={{ background: avatarColor(event.id) }}
          aria-hidden="true"
        />
        <div className={ev.info}>
          <h2 className={ev.name}>{event.name}</h2>
          {meta && <p className={ui.metaAccent}>{meta}</p>}
          <p className={ev.stats}>
            {event.memberCount} {event.memberCount > 1 ? 'potes' : 'pote'} ·{' '}
            {ROLE_LABELS[event.role]}
          </p>
        </div>
        {canInvite && !invite && (
          <button
            type="button"
            className={`${ui.buttonSecondary} ${ui.buttonSmall}`}
            onClick={() => createInvite.mutate(event.id, { onSuccess: setInvite })}
            disabled={createInvite.isPending}
          >
            Inviter
          </button>
        )}
      </div>
      {createInvite.error && <p className={ui.fieldError}>{createInvite.error.message}</p>}
      {invite && <InvitePanel invite={invite} eventName={event.name} />}
    </li>
  );
}

function InvitePanel({ invite, eventName }: { invite: CreatedInvite; eventName: string }) {
  const [copied, setCopied] = useState(false);
  const canShare = typeof navigator.share === 'function';

  async function copy() {
    try {
      await navigator.clipboard.writeText(invite.url);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  async function share() {
    try {
      await navigator.share({
        title: eventName,
        text: `Rejoins « ${eventName} » sur Pictur'Art`,
        url: invite.url,
      });
    } catch {
      // partage annulé
    }
  }

  return (
    <div className={ev.invite}>
      <p className={ui.meta}>Lien d'invitation</p>
      <p className={ev.url}>{invite.url}</p>
      <div className={ev.inviteActions}>
        <button type="button" className={`${ui.buttonSecondary} ${ui.buttonSmall}`} onClick={copy}>
          <Copy size={16} strokeWidth={1.8} aria-hidden="true" />
          {copied ? 'Copié !' : 'Copier'}
        </button>
        {canShare && (
          <button type="button" className={`${ui.button} ${ui.buttonSmall}`} onClick={share}>
            <Share size={16} strokeWidth={1.8} aria-hidden="true" />
            Partager
          </button>
        )}
      </div>
      <p className={ev.stats}>Expire dans 7 jours · les nouveaux arrivent en contributeur</p>
    </div>
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
