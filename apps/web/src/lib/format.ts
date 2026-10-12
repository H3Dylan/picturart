/** « 12—14.07.2026 » à partir de dates ISO (AAAA-MM-JJ), façon métadonnée de pellicule. */
export function formatEventDates(startsOn: string | null, endsOn: string | null) {
  const fmt = (iso: string) => iso.split('-').reverse().join('.');
  if (!startsOn) return null;
  if (!endsOn || endsOn === startsOn) return fmt(startsOn);
  const [y1, m1, d1] = startsOn.split('-');
  const [y2, m2] = endsOn.split('-');
  if (y1 === y2 && m1 === m2) return `${d1}—${fmt(endsOn)}`;
  return `${fmt(startsOn)} — ${fmt(endsOn)}`;
}

const relative = new Intl.RelativeTimeFormat('fr', { numeric: 'auto' });

/** « à l'instant », « il y a 2 h », « hier », puis la date. */
export function timeAgo(iso: string, now = Date.now()) {
  const seconds = Math.round((now - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return 'à l’instant';
  if (seconds < 3600) return relative.format(-Math.floor(seconds / 60), 'minute');
  if (seconds < 86400) return relative.format(-Math.floor(seconds / 3600), 'hour');
  if (seconds < 7 * 86400) return relative.format(-Math.floor(seconds / 86400), 'day');
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
}

const AVATAR_COLORS = ['#b7cfc9', '#e8c99b', '#e3b2a6', '#c3cba4', '#c9bedb', '#a9c8de'];

/** Couleur pastel stable pour un utilisateur (DA : avatars en pastels fixes). */
export function avatarColor(id: string) {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length] ?? AVATAR_COLORS[0];
}

export function initial(name: string) {
  return name.trim().charAt(0).toUpperCase() || '?';
}
