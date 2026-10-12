import { existsSync } from 'node:fs';
import { loadConfig } from './config.ts';
import { openDatabase } from './db/client.ts';
import type { Log } from './media/processor.ts';
import { MediaStorage } from './media/storage.ts';
import { hasTool } from './media/tools.ts';
import { MediaWorker } from './media/worker.ts';
import { PushDispatcher, webPushSender } from './notifications/dispatcher.ts';

/** Journal JSON sur une ligne, au même format que celui de l'API (pino). */
function jsonLogger(): Log {
  const write =
    (level: number) =>
    (objOrMsg: unknown, msg?: string): void => {
      const fields =
        typeof objOrMsg === 'object' && objOrMsg !== null ? { ...objOrMsg } : { msg: objOrMsg };
      if ('err' in fields && fields.err instanceof Error) {
        fields.err = { message: fields.err.message, stack: fields.err.stack };
      }
      console.log(JSON.stringify({ level, time: Date.now(), name: 'worker', ...fields, msg }));
    };
  return { info: write(30), warn: write(40), error: write(50) } as Log;
}

const config = loadConfig();
const log = jsonLogger();
const database = await openDatabase(config.DATABASE_URL, { migrations: false });
const storage = new MediaStorage(config.MEDIA_DIR);
await storage.init();

log.info(
  {
    version: config.APP_VERSION,
    ffmpeg: await hasTool(config.FFMPEG_PATH),
    heif: await hasTool(config.HEIF_DEC_PATH, '--version'),
    vaapi: config.VIDEO_HWACCEL !== 'none' && existsSync(config.VAAPI_DEVICE),
    push: Boolean(config.VAPID_PUBLIC_KEY && config.VAPID_PRIVATE_KEY),
  },
  'worker démarré',
);

const worker = new MediaWorker({ database, storage, tools: config, log });
await worker.start();

// Notifications push regroupées (sans clés VAPID : écran Activité seulement)
const dispatcher =
  config.VAPID_PUBLIC_KEY && config.VAPID_PRIVATE_KEY
    ? new PushDispatcher({ db: database.db, send: webPushSender(config), log })
    : undefined;
dispatcher?.start();

async function shutdown(signal: string) {
  log.info({ signal }, 'arrêt du worker');
  await worker.stop();
  await dispatcher?.stop();
  await database.close();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
