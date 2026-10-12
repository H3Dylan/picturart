import { DEFAULT_NOTIFICATION_PREFS, type Me } from '@picturart/shared';
import type { SessionUser } from '../auth/sessions.ts';

export function toMe(user: SessionUser): Me {
  return {
    id: user.id,
    displayName: user.displayName,
    email: user.email,
    bio: user.bio,
    theme: user.theme,
    // Clés ajoutées après la création du compte : valeurs par défaut
    notificationPrefs: { ...DEFAULT_NOTIFICATION_PREFS, ...user.notificationPrefs },
    createdAt: user.createdAt.toISOString(),
  };
}
