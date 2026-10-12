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

function NavItem({ to, label, Icon }: Item) {
  return (
    <NavLink to={to} aria-label={label} className={styles.item ?? ''}>
      <Icon size={22} strokeWidth={1.8} />
      <span className={styles.dot} aria-hidden="true" />
    </NavLink>
  );
}

export function BottomNav() {
  return (
    <nav aria-label="Navigation principale" className={styles.nav}>
      {LEFT.map((item) => (
        <NavItem key={item.to} {...item} />
      ))}
      <NavLink to="/poster" aria-label="Poster" className={styles.post ?? ''}>
        <Camera size={24} strokeWidth={1.8} />
      </NavLink>
      {RIGHT.map((item) => (
        <NavItem key={item.to} {...item} />
      ))}
    </nav>
  );
}
