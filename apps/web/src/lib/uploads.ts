import type { PostDto } from '@picturart/shared';
import { useSyncExternalStore } from 'react';
import { Upload } from 'tus-js-client';

export interface UploadState {
  /** 0 à 1 */
  progress: number;
  status: 'uploading' | 'done' | 'error';
  error?: string;
}

/**
 * Envois en cours, par identifiant de média. Vit en dehors de React pour que les envois
 * continuent quand on change d'écran.
 */
const states = new Map<string, UploadState>();
const listeners = new Set<() => void>();
let snapshot = new Map(states);

function emit() {
  snapshot = new Map(states);
  for (const listener of listeners) listener();
}

function set(mediaId: string, state: UploadState) {
  states.set(mediaId, state);
  emit();
}

const CHUNK_SIZE = 8 * 1024 * 1024;

/**
 * Envoie les fichiers d'un post, un par un (protocole tus : reprise automatique en cas de coupure).
 * `onAllDone` est appelé quand tous les envois sont terminés, avec ou sans erreur.
 */
export function startUploads(post: PostDto, files: File[], onAllDone: () => void) {
  const queue = post.media.map((media, index) => ({ media, file: files[index] }));
  for (const { media } of queue) set(media.id, { progress: 0, status: 'uploading' });

  const next = () => {
    const item = queue.shift();
    if (!item) {
      onAllDone();
      return;
    }
    const { media, file } = item;
    if (!file) {
      set(media.id, { progress: 0, status: 'error', error: 'Fichier introuvable' });
      next();
      return;
    }
    const upload = new Upload(file, {
      endpoint: '/api/v1/uploads',
      chunkSize: CHUNK_SIZE,
      retryDelays: [0, 1000, 3000, 5000, 10000, 20000],
      metadata: { mediaId: media.id, filename: file.name },
      removeFingerprintOnSuccess: true,
      onProgress: (sent, total) =>
        set(media.id, { progress: total ? sent / total : 0, status: 'uploading' }),
      onSuccess: () => {
        set(media.id, { progress: 1, status: 'done' });
        next();
      },
      onError: (error) => {
        set(media.id, { progress: 0, status: 'error', error: error.message });
        next();
      },
    });
    upload.start();
  };
  next();
}

export function useUploads() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => snapshot,
  );
}
