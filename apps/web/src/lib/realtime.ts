import type { RealtimeMessage } from '@picturart/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { keys } from './queries.ts';

/**
 * Connexion temps réel : les messages du serveur indiquent quelles données recharger.
 * Reconnexion automatique (attente croissante, et dès que l'app redevient visible).
 */
export function useRealtime(enabled: boolean) {
  const client = useQueryClient();

  useEffect(() => {
    if (!enabled) return;
    let socket: WebSocket | null = null;
    let retry = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;

    const onMessage = (event: MessageEvent<string>) => {
      let message: RealtimeMessage;
      try {
        message = JSON.parse(event.data);
      } catch {
        return;
      }
      if (!('eventId' in message)) return;
      client.invalidateQueries({ queryKey: keys.feed });
      client.invalidateQueries({ queryKey: keys.posts(message.eventId) });
      client.invalidateQueries({ queryKey: keys.post(message.postId) });
      client.invalidateQueries({ queryKey: keys.planche(message.eventId) });
      if (message.type === 'comment.created' || message.type === 'comment.deleted') {
        client.invalidateQueries({ queryKey: keys.comments(message.postId) });
      }
      if (message.type !== 'reaction.updated') {
        client.invalidateQueries({ queryKey: keys.event(message.eventId) });
      }
    };

    const connect = () => {
      if (stopped || (socket && socket.readyState <= WebSocket.OPEN)) return;
      const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
      socket = new WebSocket(`${protocol}://${location.host}/api/v1/ws`);
      socket.onopen = () => {
        retry = 0;
      };
      socket.onmessage = onMessage;
      socket.onclose = (event) => {
        socket = null;
        if (stopped || event.code === 4401) return;
        const delay = Math.min(30_000, 1000 * 2 ** retry++);
        timer = setTimeout(connect, delay);
      };
    };

    // Retour sur l'app : reconnexion immédiate et rattrapage de ce qui a changé
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      clearTimeout(timer);
      retry = 0;
      connect();
      client.invalidateQueries({ queryKey: keys.feed });
    };

    connect();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
      socket?.close();
    };
  }, [enabled, client]);
}
