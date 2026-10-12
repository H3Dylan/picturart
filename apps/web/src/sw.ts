/// <reference lib="webworker" />
// Service worker de Pictur'Art : coquille de l'app hors ligne et notifications push.
// Compilé à part (tsconfig.sw.json) et servi à la racine, en /sw.js.
import type { PushPayload } from '@picturart/shared';

declare const self: ServiceWorkerGlobalScope;
/** Identifiant de build, injecté par Vite : chaque déploiement installe un nouveau service worker. */
declare const __BUILD_ID__: string;

const SHELL = `shell-${__BUILD_ID__}`;
const ASSETS = `assets-${__BUILD_ID__}`;

self.addEventListener('install', (event) => {
  // La page d'entrée, pour pouvoir ouvrir l'app sans réseau
  event.waitUntil(
    caches
      .open(SHELL)
      .then((cache) => cache.add('/index.html'))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(names.filter((n) => n !== SHELL && n !== ASSETS).map((n) => caches.delete(n))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  // L'API (données, médias privés, temps réel) n'est jamais mise en cache ici
  if (url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    // Réseau d'abord (toujours la dernière version), coquille en cache sinon
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            void caches.open(SHELL).then((cache) => cache.put('/index.html', copy));
          }
          return response;
        })
        .catch(async () => (await caches.match('/index.html')) ?? Response.error()),
    );
    return;
  }

  // Fichiers versionnés (JS, CSS, polices) et icônes : le cache d'abord
  if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/icons/')) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ??
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              void caches.open(ASSETS).then((cache) => cache.put(request, copy));
            }
            return response;
          }),
      ),
    );
  }
});

// ---- Notifications push ---------------------------------------------------------------
self.addEventListener('push', (event) => {
  let payload: PushPayload;
  try {
    payload = event.data?.json() as PushPayload;
  } catch {
    return;
  }
  if (!payload?.title) return;
  event.waitUntil(
    Promise.all([
      self.registration.showNotification(payload.title, {
        body: payload.body,
        icon: '/icons/icon-192.png',
        badge: '/icons/badge-96.png',
        tag: payload.tag,
        lang: 'fr',
        data: { url: payload.url },
      }),
      // Pastille sur l'icône de l'app (iOS 16.4+, Android, ordinateur)
      payload.unread > 0 ? self.navigator.setAppBadge?.(payload.unread) : undefined,
    ]),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(
    (event.notification.data as { url?: string } | null)?.url ?? '/activite',
    self.location.origin,
  );
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const open = windows.find((w) => new URL(w.url).origin === url.origin);
      if (open) {
        await open.focus();
        // La page se charge de naviguer (routeur React), sans recharger l'app
        open.postMessage({ type: 'navigate', url: url.pathname + url.search });
        return;
      }
      await self.clients.openWindow(url.href);
    })(),
  );
});
