import { Camera } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router';
import { TextField } from '../components/TextField.tsx';
import ui from '../components/ui.module.css';
import { ApiError } from '../lib/api.ts';
import { useLogin, useMe } from '../lib/queries.ts';
import styles from './pages.module.css';

/** Ne suit que des chemins internes, jamais une URL externe passée en paramètre. */
export function safeNext(value: string | null) {
  return value?.startsWith('/') && !value.startsWith('//') ? value : '/';
}

export function LoginPage() {
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const navigate = useNavigate();
  const { data: me } = useMe();
  const login = useLogin();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  if (me) return <Navigate to={next} replace />;

  function submit(event: FormEvent) {
    event.preventDefault();
    login.mutate({ email, password }, { onSuccess: () => navigate(next, { replace: true }) });
  }

  const error = login.error instanceof ApiError ? login.error : null;

  return (
    <main className={styles.screen}>
      <div className={styles.brandBlock}>
        <span className={styles.logoBig}>
          <Camera size={44} strokeWidth={1.8} aria-hidden="true" />
        </span>
        <h1 className={styles.brandTitle}>Pictur'Art</h1>
        <p className={ui.meta}>Réseau privé · sur invitation</p>
      </div>

      <form className={styles.stack} onSubmit={submit} noValidate>
        <TextField
          label="E-mail"
          type="email"
          autoComplete="email"
          inputMode="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={error?.fields.email}
          required
        />
        <TextField
          label="Mot de passe"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={error?.fields.password}
          required
        />
        {error && !Object.keys(error.fields).length && (
          <p className={ui.formError} role="alert">
            {error.message}
          </p>
        )}
        <button type="submit" className={ui.button} disabled={login.isPending}>
          {login.isPending ? 'Connexion…' : 'Se connecter'}
        </button>
      </form>

      <p className={`${styles.center} ${styles.actions}`}>
        Pas encore de compte ? Demande un lien d'invitation à un pote de la bande.
      </p>
    </main>
  );
}
