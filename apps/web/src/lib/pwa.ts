import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { api } from './api.ts';

/** Ouverte depuis l'icône de l'écran d'accueil (et non dans le navigateur). */
export function isStandalone() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/** iPhone ou iPad (les iPad récents se présentent comme des Mac tactiles). */
export function isIos() {
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.userAgent.includes('Macintosh') && navigator.maxTouchPoints > 1)
  );
}

/**
 * Service worker : uniquement sur la version construite (en développement, Vite sert les
 * modules à la volée). Un clic sur une notification demande à l'app de changer d'écran.
 */
export function registerServiceWorker(navigate: (url: string) => void) {
  if (!('serviceWorker' in navigator) || !import.meta.env.PROD) return;
  navigator.serviceWorker.register('/sw.js').catch(() => {});
  navigator.serviceWorker.addEventListener('message', (event: MessageEvent) => {
    const data = event.data as { type?: string; url?: string } | null;
    if (data?.type === 'navigate' && data.url?.startsWith('/')) navigate(data.url);
  });
}

// ---- Installation (Android, Chrome, Edge) : invite native gardée pour notre bouton ----
interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferredPrompt: InstallPromptEvent | null = null;
const installListeners = new Set<() => void>();
const notifyInstall = () => {
  for (const listener of installListeners) listener();
};

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  deferredPrompt = event as InstallPromptEvent;
  notifyInstall();
});
window.addEventListener('appinstalled', () => {
  deferredPrompt = null;
  notifyInstall();
});

/** Invite d'installation native disponible, et de quoi la déclencher. */
export function useInstallPrompt() {
  const available = useSyncExternalStore(
    (listener) => {
      installListeners.add(listener);
      return () => installListeners.delete(listener);
    },
    () => deferredPrompt !== null,
  );
  return {
    available,
    async prompt() {
      if (!deferredPrompt) return false;
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      deferredPrompt = null;
      notifyInstall();
      return outcome === 'accepted';
    },
  };
}

// ---- Notifications push ----------------------------------------------------------------
/**
 * - `unsupported` : navigateur sans Web Push (ou version de développement) ;
 * - `needs-install` : iPhone dans Safari, le push n'existe qu'une fois l'app installée ;
 * - `unavailable` : push non configuré côté serveur ;
 * - `denied` : refusé dans les réglages du téléphone ;
 * - `off` / `on` : sur cet appareil.
 */
export type PushState = 'unsupported' | 'needs-install' | 'unavailable' | 'denied' | 'off' | 'on';

const pushSupported = () =>
  'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

async function registration() {
  if (!('serviceWorker' in navigator)) return undefined;
  return navigator.serviceWorker.getRegistration();
}

export async function pushState(): Promise<PushState> {
  if (!pushSupported()) return isIos() && !isStandalone() ? 'needs-install' : 'unsupported';
  const reg = await registration();
  if (!reg) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  return (await reg.pushManager.getSubscription()) ? 'on' : 'off';
}

function base64UrlToBytes(value: string) {
  const base64 = (value + '='.repeat((4 - (value.length % 4)) % 4))
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
}

/** Demande l'autorisation, abonne l'appareil et l'enregistre côté serveur. */
export async function enablePush(): Promise<PushState> {
  const reg = await registration();
  if (!pushSupported() || !reg) return pushState();
  let publicKey: string;
  try {
    ({ publicKey } = await api<{ publicKey: string }>('/push/key'));
  } catch {
    return 'unavailable';
  }
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'off';
  const subscription =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: base64UrlToBytes(publicKey),
    }));
  await api('/push/subscriptions', { method: 'POST', body: subscription.toJSON() });
  return 'on';
}

/** Désabonne cet appareil (déconnexion, ou réglage « Notifications sur cet appareil »). */
export async function disablePush() {
  const subscription = await (await registration())?.pushManager.getSubscription();
  if (!subscription) return;
  await api('/push/subscriptions', {
    method: 'DELETE',
    body: { endpoint: subscription.endpoint },
  }).catch(() => {});
  await subscription.unsubscribe();
}

/** Pastille sur l'icône de l'app installée (nombre de notifications non lues). */
export function setAppBadge(count: number) {
  const nav = navigator as Navigator & {
    setAppBadge?: (n: number) => Promise<void>;
    clearAppBadge?: () => Promise<void>;
  };
  (count > 0 ? nav.setAppBadge?.(count) : nav.clearAppBadge?.())?.catch(() => {});
}

/** État des notifications push sur cet appareil, et de quoi les activer ou les couper. */
export function usePush() {
  const [state, setState] = useState<PushState | 'loading'>('loading');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void pushState().then(setState);
  }, []);

  const run = useCallback(async (action: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await action();
    } catch {
      // État relu ci-dessous, quoi qu'il arrive
    } finally {
      setState(await pushState().catch(() => 'unsupported' as const));
      setBusy(false);
    }
  }, []);

  return {
    state,
    busy,
    enable: () => run(enablePush),
    disable: () => run(disablePush),
  };
}

const NUDGE_KEY = 'pa-notifs-nudge';

/** L'invitation à activer les notifications a-t-elle été écartée sur cet appareil ? */
export function nudgeDismissed() {
  try {
    return localStorage.getItem(NUDGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function dismissNudge() {
  try {
    localStorage.setItem(NUDGE_KEY, '1');
  } catch {
    // Stockage indisponible (navigation privée) : l'invitation reviendra, tant pis
  }
}
