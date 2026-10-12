import { Navigate, Outlet, useLocation } from 'react-router';
import { BottomNav } from '../components/BottomNav.tsx';
import { useMe } from '../lib/queries.ts';
import { useApplyTheme } from '../lib/theme.ts';
import { Splash } from './Splash.tsx';

/** Pages réservées aux membres connectés, avec la barre de navigation. */
export function AppLayout() {
  const { data: me, isPending } = useMe();
  const location = useLocation();
  useApplyTheme(me?.theme);

  if (isPending) return <Splash />;
  if (!me) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/connexion?next=${next}`} replace />;
  }
  return (
    <>
      <Outlet />
      <BottomNav />
    </>
  );
}

/** Racine : vers les événements si connecté, sinon vers la connexion. */
export function HomeRedirect() {
  const { data: me, isPending } = useMe();
  if (isPending) return <Splash />;
  return <Navigate to={me ? '/evenements' : '/connexion'} replace />;
}
