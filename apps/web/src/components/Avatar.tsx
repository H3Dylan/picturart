import { avatarColor, initial } from '../lib/format.ts';
import ui from './ui.module.css';

interface AvatarProps {
  id: string;
  name: string;
  size?: number;
}

/** Avatar pastel avec l'initiale (les photos de profil arrivent avec l'envoi de médias, M2). */
export function Avatar({ id, name, size = 40 }: AvatarProps) {
  return (
    <span
      className={ui.avatar}
      style={{ width: size, height: size, fontSize: size * 0.4, background: avatarColor(id) }}
      aria-hidden="true"
    >
      {initial(name)}
    </span>
  );
}
