import { z } from 'zod';

/** Réponse de GET /api/v1/health, partagée entre l'API et la PWA. */
export const healthSchema = z.object({
  status: z.enum(['ok', 'degraded']),
  database: z.enum(['ok', 'down']),
  version: z.string(),
});

export type Health = z.infer<typeof healthSchema>;
