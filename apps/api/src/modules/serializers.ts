import type { Me } from '@picturart/shared';
import type { SessionUser } from '../auth/sessions.ts';

export function toMe(user: SessionUser): Me {
  return {
    id: user.id,
    displayName: user.displayName,
    email: user.email,
    bio: user.bio,
    theme: user.theme,
    createdAt: user.createdAt.toISOString(),
  };
}
