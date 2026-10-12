import { signupSchema } from '@picturart/shared';
import { ChevronLeft } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router';
import { TextField } from '../components/TextField.tsx';
import ui from '../components/ui.module.css';
import { ApiError } from '../lib/api.ts';
import { useAcceptInvite, useInvite, useMe } from '../lib/queries.ts';
import styles from './pages.module.css';
import { Splash } from './Splash.tsx';

export function SignupPage() {
  const { token = '' } = useParams();
  const navigate = useNavigate();
  const { data: me } = useMe();
  const invite = useInvite(token);
  const accept = useAcceptInvite(token);
  const [form, setForm] = useState({ displayName: '', email: '', password: '' });
  const [localErrors, setLocalErrors] = useState<Record<string, string>>({});

  // Déjà connecté en arrivant : retour à l'invitation (pas après une inscription réussie)
  if (me && accept.isIdle) return <Navigate to={`/i/${token}`} replace />;
  if (invite.isPending) return <Splash />;
  if (invite.isError) return <Navigate to={`/i/${token}`} replace />;

  function submit(event: FormEvent) {
    event.preventDefault();
    // Mêmes règles qu'au serveur, pour répondre tout de suite
    const parsed = signupSchema.safeParse(form);
    if (!parsed.success) {
      const errors: Record<string, string> = {};
      for (const issue of parsed.error.issues) errors[String(issue.path[0])] ??= issue.message;
      setLocalErrors(errors);
      return;
    }
    setLocalErrors({});
    accept.mutate(parsed.data, { onSuccess: () => navigate('/evenements', { replace: true }) });
  }

  const apiError = accept.error instanceof ApiError ? accept.error : null;
  const errors = { ...apiError?.fields, ...localErrors };
  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  return (
    <main className={styles.screen}>
      <header className={styles.header}>
        <Link to={`/i/${token}`} aria-label="Retour" className={ui.iconButton}>
          <ChevronLeft size={20} strokeWidth={1.8} />
        </Link>
      </header>

      <div className={styles.stack} style={{ gap: 8 }}>
        <h1 className={ui.pageTitle}>Comment la bande t'appelle ?</h1>
        <p className={styles.lead}>
          Tu rejoins <span className={styles.strong}>{invite.data.event.name}</span>, invité par{' '}
          {invite.data.invitedBy.displayName}.
        </p>
      </div>

      <form className={styles.stack} onSubmit={submit} noValidate>
        <TextField
          label="Prénom ou surnom"
          autoComplete="nickname"
          value={form.displayName}
          onChange={set('displayName')}
          error={errors.displayName}
        />
        <TextField
          label="E-mail"
          type="email"
          autoComplete="email"
          inputMode="email"
          value={form.email}
          onChange={set('email')}
          error={errors.email}
        />
        {apiError?.code === 'email_taken' && (
          <Link
            to={`/connexion?next=${encodeURIComponent(`/i/${token}`)}`}
            className={ui.linkButton}
          >
            Me connecter pour rejoindre l'événement
          </Link>
        )}
        <TextField
          label="Mot de passe"
          hint="8 caractères minimum"
          type="password"
          autoComplete="new-password"
          value={form.password}
          onChange={set('password')}
          error={errors.password}
        />
        {apiError && !Object.keys(apiError.fields).length && (
          <p className={ui.formError} role="alert">
            {apiError.message}
          </p>
        )}
        <button type="submit" className={ui.button} disabled={accept.isPending}>
          {accept.isPending ? 'Un instant…' : 'Entrer dans la bande'}
        </button>
      </form>
    </main>
  );
}
