import { createBrowserRouter } from 'react-router';
import { AppLayout, HomeRedirect } from './pages/AppLayout.tsx';
import { ComingSoonPage, NotFoundPage } from './pages/ComingSoonPage.tsx';
import { EventMembersPage } from './pages/EventMembersPage.tsx';
import { EventPage } from './pages/EventPage.tsx';
import { EventsPage } from './pages/EventsPage.tsx';
import { InvitePage } from './pages/InvitePage.tsx';
import { LoginPage } from './pages/LoginPage.tsx';
import { NewPostPage } from './pages/NewPostPage.tsx';
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
      { path: '/evenements/:id', element: <EventPage /> },
      { path: '/evenements/:id/membres', element: <EventMembersPage /> },
      { path: '/poster', element: <NewPostPage /> },
      { path: '/profil', element: <ProfilePage /> },
      { path: '/fil', element: <ComingSoonPage title="Le fil" milestone="Jalon M3" /> },
      { path: '/activite', element: <ComingSoonPage title="Activité" milestone="Jalon M5" /> },
    ],
  },
  { path: '*', element: <NotFoundPage /> },
]);
