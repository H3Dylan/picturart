import { useCallback, useEffect, useRef } from 'react';

const DELAY = 260;

/**
 * Distingue un appui simple d'un double appui.
 * L'appui simple est différé de 260 ms, le temps de voir si un second arrive.
 */
export function useDoubleTap(onTap: () => void, onDoubleTap: () => void) {
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  return useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = undefined;
      onDoubleTap();
      return;
    }
    timer.current = setTimeout(() => {
      timer.current = undefined;
      onTap();
    }, DELAY);
  }, [onTap, onDoubleTap]);
}
