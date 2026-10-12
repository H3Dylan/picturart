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
  /**
   * Traitement des médias dans le processus de l'API (développement, tests).
   * En production, c'est le conteneur `worker` qui s'en charge. Par défaut : hors production.
   */
  WORKER_INLINE: z.enum(['true', 'false']).optional(),
  /** Transcodage vidéo : `vaapi` (QuickSync de l'iGPU Intel), `none` (logiciel), `auto` (vaapi si la carte est là). */
  VIDEO_HWACCEL: z.enum(['auto', 'vaapi', 'none']).default('auto'),
  VAAPI_DEVICE: z.string().default('/dev/dri/renderD128'),
  FFMPEG_PATH: z.string().default('ffmpeg'),
  FFPROBE_PATH: z.string().default('ffprobe'),
  /** Décodeur HEIC de libheif (`heif-dec`, ou `heif-convert` sur les versions antérieures à 1.18). */
  HEIF_DEC_PATH: z.string().default('heif-dec'),
});

export type Config = Omit<z.infer<typeof envSchema>, 'WORKER_INLINE'> & {
  cookieSecure: boolean;
  workerInline: boolean;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    throw new Error(`Configuration invalide :\n${z.prettifyError(parsed.error)}`);
  }
  const { WORKER_INLINE, ...rest } = parsed.data;
  return {
    ...rest,
    cookieSecure: rest.APP_ORIGIN.startsWith('https://'),
    workerInline: WORKER_INLINE ? WORKER_INLINE === 'true' : rest.NODE_ENV !== 'production',
  };
}
