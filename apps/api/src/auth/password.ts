import { randomBytes } from 'node:crypto';
import { hash, verify } from '@node-rs/argon2';

// Argon2id avec les paramètres par défaut de @node-rs/argon2 (m=19 Mio, t=2, p=1), recommandés par l'OWASP.
export const hashPassword = (password: string) => hash(password);

// Haché factice, vérifié quand l'e-mail est inconnu : le temps de réponse
// ne révèle pas si un compte existe.
let dummyHash: Promise<string> | undefined;

export async function verifyPassword(passwordHash: string | null, password: string) {
  dummyHash ??= hash(randomBytes(16).toString('hex'));
  try {
    const ok = await verify(passwordHash ?? (await dummyHash), password);
    return passwordHash !== null && ok;
  } catch {
    return false;
  }
}
