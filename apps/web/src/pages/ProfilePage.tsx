import type { Me, Theme } from '@picturart/shared';
import { type FormEvent, useState } from 'react';
import { useNavigate } from 'react-router';
import { Avatar } from '../components/Avatar.tsx';
import { TextField } from '../components/TextField.tsx';
import ui from '../components/ui.module.css';
import { ApiError } from '../lib/api.ts';
import { useLogout, useMe, useUpdateMe } from '../lib/queries.ts';
import { applyTheme } from '../lib/theme.ts';
import styles from './pages.module.css';

const THEME_OPTIONS: { value: Theme; label: string }[] = [
  { value: 'auto', label: 'Auto' },
  { value: 'light', label: 'Clair' },
  { value: 'dark', label: 'Sombre' },
];

export function ProfilePage() {
  const { data: me } = useMe();
  if (!me) return null;
  return <Profile me={me} />;
}

function Profile({ me }: { me: Me }) {
  const navigate = useNavigate();
  const update = useUpdateMe();
  const logout = useLogout();
  const [form, setForm] = useState({ displayName: me.displayName, bio: me.bio });
  const [saved, setSaved] = useState(false);
  const errors = update.error instanceof ApiError ? update.error.fields : {};
  const dirty = form.displayName !== me.displayName || form.bio !== me.bio;

  function save(event: FormEvent) {
    event.preventDefault();
    update.mutate(form, { onSuccess: () => setSaved(true) });
  }

  function chooseTheme(theme: Theme) {
    applyTheme(theme);
    update.mutate({ theme });
  }

  return (
    <main className={`${styles.screen} ${styles.withNav}`}>
      <h1 className={ui.pageTitle}>Mon profil</h1>

      <section className={`${ui.card} ${styles.headerRow}`} style={{ padding: 14 }}>
        <Avatar id={me.id} name={form.displayName || me.displayName} size={60} />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 20 }}>{me.displayName}</div>
          <p className={ui.meta} style={{ letterSpacing: 1, textTransform: 'none' }}>
            {me.email}
          </p>
        </div>
      </section>

      <form className={styles.stack} onSubmit={save} noValidate>
        <TextField
          label="Prénom ou surnom"
          value={form.displayName}
          onChange={(e) => {
            setSaved(false);
            setForm((f) => ({ ...f, displayName: e.target.value }));
          }}
          error={errors.displayName}
        />
        <TextField
          label="Bio"
          hint="160 caractères"
          placeholder="Photographe officiel des soirées (non élu)"
          value={form.bio}
          onChange={(e) => {
            setSaved(false);
            setForm((f) => ({ ...f, bio: e.target.value }));
          }}
          error={errors.bio}
        />
        <button type="submit" className={ui.buttonSecondary} disabled={!dirty || update.isPending}>
          {saved && !dirty ? 'Enregistré' : 'Enregistrer'}
        </button>
      </form>

      <section className={styles.stack} style={{ gap: 8 }}>
        <h2 className={ui.label} style={{ margin: 0, color: 'var(--ink-muted)' }}>
          Apparence
        </h2>
        <fieldset className={ui.segmented}>
          <legend className={ui.visuallyHidden}>Thème</legend>
          {THEME_OPTIONS.map((option) => (
            <label key={option.value} className={ui.segment}>
              <input
                type="radio"
                name="theme"
                value={option.value}
                checked={me.theme === option.value}
                onChange={() => chooseTheme(option.value)}
                className={ui.visuallyHidden}
              />
              {option.label}
            </label>
          ))}
        </fieldset>
      </section>

      <button
        type="button"
        className={ui.linkButton}
        style={{ alignSelf: 'flex-start' }}
        onClick={() => logout.mutate(undefined, { onSuccess: () => navigate('/connexion') })}
      >
        Se déconnecter
      </button>
    </main>
  );
}
