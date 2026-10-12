import { Activity, Camera, Home, LayoutGrid, User } from 'lucide-react';
import type { ComponentType } from 'react';
import { NavLink } from 'react-router';
import styles from './BottomNav.module.css';

interface Item {
  to: string;
  label: string;
  Icon: ComponentType<{ size?: number; strokeWidth?: number }>;
}

const LEFT: Item[] = [
  { to: '/fil', label: 'Fil', Icon: Home },
  { to: '/evenements', label: 'Événements', Icon: LayoutGrid },
];
const RIGHT: Item[] = [
  { to: '/activite', label: 'Activité', Icon: Activity },
  { to: '/profil', label: 'Mon profil', Icon: User },
];

function NavItem({ to, label, Icon, badge = 0 }: Item & { badge?: number }) {
  return (
    <NavLink
      to={to}
      aria-label={badge ? `${label}, ${badge} non lue${badge > 1 ? 's' : ''}` : label}
      className={styles.item ?? ''}
    >
      <Icon size={22} strokeWidth={1.8} />
      {badge > 0 && (
        <span className={styles.badge} aria-hidden="true">
          {badge > 9 ? '9+' : badge}
        </span>
      )}
      <span className={styles.dot} aria-hidden="true" />
    </NavLink>
  );
}

/** Barre de navigation flottante ; la pastille d'Activité compte les notifications non lues. */
export function BottomNav({ unread = 0 }: { unread?: number }) {
  return (
    <nav aria-label="Navigation principale" className={styles.nav}>
      {LEFT.map((item) => (
        <NavItem key={item.to} {...item} />
      ))}
      <NavLink to="/poster" aria-label="Poster" className={styles.post ?? ''}>
        <Camera size={24} strokeWidth={1.8} />
      </NavLink>
      {RIGHT.map((item) => (
        <NavItem key={item.to} {...item} badge={item.to === '/activite' ? unread : 0} />
      ))}
    </nav>
  );
}
