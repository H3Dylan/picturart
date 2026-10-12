import { buildApp } from './app.ts';
import { loadConfig } from './config.ts';
import { openDatabase } from './db/client.ts';

const config = loadConfig();
const database = await openDatabase(config.DATABASE_URL);
const app = await buildApp({ config, database, logger: true });

async function shutdown(signal: string) {
  app.log.info(`${signal} reçu, arrêt en cours`);
  await app.close();
  await database.close();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

await app.listen({ host: '0.0.0.0', port: config.PORT });
