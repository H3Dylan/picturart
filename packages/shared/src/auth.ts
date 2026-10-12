import { z } from 'zod';

export const THEMES = ['auto', 'light', 'dark'] as const;
export type Theme = (typeof THEMES)[number];

const email = z.email('E-mail invalide').trim().toLowerCase().max(254);
const password = z.string().min(8, '8 caractères minimum').max(200, 'Mot de passe trop long');
const displayName = z
  .string()
  .trim()
  .min(1, 'Choisis un prénom ou un surnom')
  .max(40, '40 caractères maximum');

export const loginSchema = z.object({
  email,
  password: z.string().min(1, 'Mot de passe requis').max(200),
});
export type LoginInput = z.infer<typeof loginSchema>;

/** Inscription : uniquement via un lien d'invitation. */
export const signupSchema = z.object({ displayName, email, password });
export type SignupInput = z.infer<typeof signupSchema>;

export const updateMeSchema = z
  .object({
    displayName,
    bio: z.string().trim().max(160, '160 caractères maximum'),
    theme: z.enum(THEMES),
  })
  .partial();
export type UpdateMeInput = z.infer<typeof updateMeSchema>;

export interface Me {
  id: string;
  displayName: string;
  email: string;
  bio: string;
  theme: Theme;
  createdAt: string;
}
