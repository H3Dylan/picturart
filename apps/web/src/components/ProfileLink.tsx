import type { ReactNode } from 'react';
import { Link } from 'react-router';
import ui from './ui.module.css';

/** Avatar ou prénom menant au profil d'un pote. */
export function ProfileLink({
  user,
  children,
  label = true,
}: {
  user: { id: string; displayName: string };
  children: ReactNode;
  /** Ajoute « Profil de … » pour un lien qui ne contient qu'un avatar. */
  label?: boolean;
}) {
  return (
    <Link
      to={`/potes/${user.id}`}
      className={ui.plainLink}
      {...(label && { 'aria-label': `Profil de ${user.displayName}` })}
    >
      {children}
    </Link>
  );
}
