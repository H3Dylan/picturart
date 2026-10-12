import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().regex(/^(postgres(ql)?|pglite):\/\//, 'URL postgres:// ou pglite://'),
  APP_VERSION: z.string().default('dev'),
  /** Origine publique de la PWA : liens d'invitation et protection CSRF. */
  APP_ORIGIN: z.url().default('http://localhost:5173'),
  SESSION_DAYS: z.coerce.number().int().positive().default(90),
  /** Dossier des médias : originaux, vignettes, envois en cours. */
  MEDIA_DIR: z.string().default('./.data/media'),
});

export type Config = z.infer<typeof envSchema> & { cookieSecure: boolean };

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    throw new Error(`Configuration invalide :\n${z.prettifyError(parsed.error)}`);
  }
  return { ...parsed.data, cookieSecure: parsed.data.APP_ORIGIN.startsWith('https://') };
}
