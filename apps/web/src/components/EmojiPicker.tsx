import { normalizeEmoji } from '@picturart/shared';
import { useEffect, useRef, useState } from 'react';
import styles from './EmojiPicker.module.css';

interface EmojiPickerProps {
  /** Emoji choisi, déjà mis sous sa forme officielle. */
  onPick: (emoji: string) => void;
}

/**
 * Tous les emojis, avec recherche en français, catégories, récents et couleurs de peau
 * (emoji-picker-element). La bibliothèque et ses données (≈ 400 Ko, servies par notre
 * serveur) ne se chargent qu'à la première ouverture, puis restent en cache.
 */
export function EmojiPicker({ onPick }: EmojiPickerProps) {
  const host = useRef<HTMLDivElement>(null);
  const pick = useRef(onPick);
  pick.current = onPick;
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let picker: HTMLElement | undefined;
    let cancelled = false;
    Promise.all([
      import('emoji-picker-element'),
      import('emoji-picker-element/i18n/fr.js'),
      import('emoji-picker-element-data/fr/emojibase/data.json?url'),
    ])
      .then(([{ Picker }, { default: fr }, { default: dataSource }]) => {
        if (cancelled || !host.current) return;
        picker = new Picker({ locale: 'fr', dataSource, i18n: fr });
        picker.className = styles.picker ?? '';
        picker.addEventListener('emoji-click', (event) => {
          const unicode = (event as CustomEvent<{ unicode?: string }>).detail.unicode;
          const emoji = unicode ? normalizeEmoji(unicode) : null;
          if (emoji) pick.current(emoji);
        });
        host.current.append(picker);
      })
      .catch(() => setFailed(true));
    return () => {
      cancelled = true;
      picker?.remove();
    };
  }, []);

  if (failed) {
    return <p className={styles.failed}>Les emojis n'ont pas pu se charger. Réessaie plus tard.</p>;
  }
  return <div ref={host} className={styles.host} />;
}
