/**
 * Amorçage : crée le premier compte (admin) et son premier événement, puis affiche
 * un lien d'invitation. Toutes les inscriptions suivantes passent par des invitations.
 *
 * Usage (sur le serveur) :
 *   docker compose exec -it api node src/cli/create-event.ts
 * Le mot de passe est demandé de façon interactive, jamais passé en argument.
 */
import { createInterface } from 'node:readline/promises';
import { createEventSchema, signupSchema } from '@picturart/shared';
import { eq } from 'drizzle-orm';
import { hashPassword } from '../auth/password.ts';
import { loadConfig } from '../config.ts';
import { openDatabase } from '../db/client.ts';
import { eventMembers, events, invites, users } from '../db/schema.ts';
import { randomToken, sha256 } from '../lib/tokens.ts';

const config = loadConfig();
const { db, close } = await openDatabase(config.DATABASE_URL);
const rl = createInterface({ input: process.stdin, output: process.stdout });

async function askHidden(question: string) {
  // Masque la saisie du mot de passe dans le terminal
  const output = process.stdout;
  const write = output.write.bind(output);
  output.write = ((chunk: string) =>
    chunk === question ? write(chunk) : true) as typeof output.write;
  const answer = await rl.question(question);
  output.write = write;
  write('\n');
  return answer;
}

try {
  const email = (await rl.question('E-mail : ')).trim().toLowerCase();
  let [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);

  if (user) {
    console.log(`Compte existant : ${user.displayName}`);
  } else {
    const displayName = await rl.question('Prénom ou surnom : ');
    const password = await askHidden('Mot de passe (8 caractères min.) : ');
    const input = signupSchema.parse({ displayName, email, password });
    [user] = await db
      .insert(users)
      .values({
        displayName: input.displayName,
        email: input.email,
        passwordHash: await hashPassword(input.password),
      })
      .returning();
    console.log(`Compte créé : ${input.displayName}`);
  }
  if (!user) throw new Error('Compte introuvable');

  const { name } = createEventSchema.parse({
    name: await rl.question('Nom du premier événement : '),
  });
  const [event] = await db.insert(events).values({ name, createdBy: user.id }).returning();
  if (!event) throw new Error('Création de l’événement impossible');
  await db.insert(eventMembers).values({ eventId: event.id, userId: user.id, role: 'admin' });

  const token = randomToken();
  await db.insert(invites).values({
    eventId: event.id,
    tokenHash: sha256(token),
    createdBy: user.id,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  });
  console.log(`\nÉvénement « ${name} » créé.`);
  console.log(`Lien d'invitation (7 jours) : ${config.APP_ORIGIN}/i/${token}`);
} finally {
  rl.close();
  await close();
}
