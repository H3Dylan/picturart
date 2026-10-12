import { createBrowserRouter } from 'react-router';
import { ActivityPage } from './pages/ActivityPage.tsx';
import { AppLayout, HomeRedirect } from './pages/AppLayout.tsx';
import { CommentsPage } from './pages/CommentsPage.tsx';
import { EventMembersPage } from './pages/EventMembersPage.tsx';
import { EventPage } from './pages/EventPage.tsx';
import { EventsPage } from './pages/EventsPage.tsx';
import { FeedPage } from './pages/FeedPage.tsx';
import { InvitePage } from './pages/InvitePage.tsx';
import { LoginPage } from './pages/LoginPage.tsx';
import { NewPostPage } from './pages/NewPostPage.tsx';
import { NotFoundPage } from './pages/NotFoundPage.tsx';
import { ProfilePage } from './pages/ProfilePage.tsx';
import { SignupPage } from './pages/SignupPage.tsx';
import { PlancheViewerPage, PostViewerPage } from './pages/ViewerPage.tsx';
import { WelcomePage } from './pages/WelcomePage.tsx';

export const router = createBrowserRouter([
  { path: '/', element: <HomeRedirect /> },
  { path: '/connexion', element: <LoginPage /> },
  { path: '/i/:token', element: <InvitePage /> },
  { path: '/i/:token/inscription', element: <SignupPage /> },
  {
    element: <AppLayout />,
    children: [
      { path: '/fil', element: <FeedPage /> },
      { path: '/evenements', element: <EventsPage /> },
      { path: '/evenements/:id', element: <EventPage /> },
      { path: '/evenements/:id/membres', element: <EventMembersPage /> },
      { path: '/poster', element: <NewPostPage /> },
      { path: '/profil', element: <ProfilePage /> },
      { path: '/activite', element: <ActivityPage /> },
    ],
  },
  {
    // Écrans plein écran, sans barre de navigation
    element: <AppLayout nav={false} />,
    children: [
      { path: '/posts/:postId/photos/:index', element: <PostViewerPage /> },
      { path: '/evenements/:eventId/photos/:index', element: <PlancheViewerPage /> },
      { path: '/posts/:postId/commentaires', element: <CommentsPage /> },
      { path: '/bienvenue', element: <WelcomePage /> },
    ],
  },
  { path: '*', element: <NotFoundPage /> },
]);
