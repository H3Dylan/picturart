import { createBrowserRouter } from 'react-router';
import { AppLayout, HomeRedirect } from './pages/AppLayout.tsx';
import { ComingSoonPage, NotFoundPage } from './pages/ComingSoonPage.tsx';
import { EventsPage } from './pages/EventsPage.tsx';
import { InvitePage } from './pages/InvitePage.tsx';
import { LoginPage } from './pages/LoginPage.tsx';
import { ProfilePage } from './pages/ProfilePage.tsx';
import { SignupPage } from './pages/SignupPage.tsx';

export const router = createBrowserRouter([
  { path: '/', element: <HomeRedirect /> },
  { path: '/connexion', element: <LoginPage /> },
  { path: '/i/:token', element: <InvitePage /> },
  { path: '/i/:token/inscription', element: <SignupPage /> },
  {
    element: <AppLayout />,
    children: [
      { path: '/evenements', element: <EventsPage /> },
      { path: '/profil', element: <ProfilePage /> },
      { path: '/fil', element: <ComingSoonPage title="Le fil" milestone="Jalon M3" /> },
      { path: '/activite', element: <ComingSoonPage title="Activité" milestone="Jalon M5" /> },
      {
        path: '/poster',
        element: <ComingSoonPage title="Poster des photos" milestone="Jalon M2" />,
      },
    ],
  },
  { path: '*', element: <NotFoundPage /> },
]);
