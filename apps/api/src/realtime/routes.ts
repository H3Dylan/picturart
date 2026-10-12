import type { FastifyInstance } from 'fastify';
import type { Config } from '../config.ts';
import type { RealtimeHub } from './hub.ts';

const KEEPALIVE_MS = 25_000;

export function realtimeRoutes(app: FastifyInstance, hub: RealtimeHub, config: Config) {
  app.get('/api/v1/ws', { websocket: true }, (socket, request) => {
    // Une page d'un autre site ne doit pas pouvoir ouvrir une connexion avec nos cookies
    const origin = request.headers.origin;
    if (!request.user || (origin && origin !== config.APP_ORIGIN)) {
      socket.close(4401, 'non autorisé');
      return;
    }
    const userId = request.user.id;
    hub.add(userId, socket);

    // Ping régulier : garde la connexion ouverte à travers Traefik et détecte les coupures
    const keepalive = setInterval(() => socket.ping(), KEEPALIVE_MS);
    socket.on('close', () => {
      clearInterval(keepalive);
      hub.remove(userId, socket);
    });
    socket.send(JSON.stringify({ type: 'hello' }));
  });
}
