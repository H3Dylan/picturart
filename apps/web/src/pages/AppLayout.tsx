import { useEffect } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router';
import { BottomNav } from '../components/BottomNav.tsx';
import { setAppBadge } from '../lib/pwa.ts';
import { useMe, useUnread } from '../lib/queries.ts';
import { useRealtime } from '../lib/realtime.ts';
import { useApplyTheme } from '../lib/theme.ts';
import { Splash } from './Splash.tsx';

/**
 * Pages réservées aux membres connectés : thème, temps réel et, sauf pour les écrans
 * plein écran (visionneuse, commentaires), la barre de navigation.
 */
export function AppLayout({ nav = true }: { nav?: boolean }) {
  const { data: me, isPending } = useMe();
  const location = useLocation();
  useApplyTheme(me?.theme);
  useRealtime(Boolean(me));
  const unread = useUnread(Boolean(me)).data ?? 0;
  useEffect(() => setAppBadge(unread), [unread]);

  if (isPending) return <Splash />;
  if (!me) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/connexion?next=${next}`} replace />;
  }
  return (
    <>
      <Outlet />
      {nav && <BottomNav unread={unread} />}
    </>
  );
}

/** Racine : vers le fil si connecté, sinon vers la connexion. */
export function HomeRedirect() {
  const { data: me, isPending } = useMe();
  if (isPending) return <Splash />;
  return <Navigate to={me ? '/fil' : '/connexion'} replace />;
}
