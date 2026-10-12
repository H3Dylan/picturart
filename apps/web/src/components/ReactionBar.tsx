import { REACTION_EMOJIS, type ReactionEmoji, type Reactions } from '@picturart/shared';
import { SmilePlus } from 'lucide-react';
import { useEffect, useState } from 'react';
import styles from './ReactionBar.module.css';

interface ReactionBarProps {
  reactions: Reactions;
  onReact: (emoji: ReactionEmoji | null) => void;
  /** Variante claire sur fond sombre (visionneuse). */
  onDark?: boolean;
}

/** Applique localement une réaction, pour un retour immédiat avant la réponse du serveur. */
export function applyReaction(current: Reactions, emoji: ReactionEmoji | null): Reactions {
  const counts = new Map(current.counts.map((c) => [c.emoji, c.count]));
  if (current.mine) counts.set(current.mine, (counts.get(current.mine) ?? 1) - 1);
  if (emoji) counts.set(emoji, (counts.get(emoji) ?? 0) + 1);
  return {
    mine: emoji,
    counts: [...counts]
      .filter(([, count]) => count > 0)
      .map(([e, count]) => ({ emoji: e, count }))
      .sort((a, b) => b.count - a.count),
  };
}

export function ReactionBar({ reactions, onReact, onDark = false }: ReactionBarProps) {
  const [local, setLocal] = useState(reactions);
  const [picking, setPicking] = useState(false);
  useEffect(() => setLocal(reactions), [reactions]);

  function react(emoji: ReactionEmoji | null) {
    setLocal((current) => applyReaction(current, emoji));
    setPicking(false);
    onReact(emoji);
  }

  return (
    <div className={`${styles.bar} ${onDark ? styles.dark : ''}`}>
      {local.counts.map(({ emoji, count }) => {
        const mine = local.mine === emoji;
        return (
          <button
            key={emoji}
            type="button"
            className={`${styles.pill} ${mine ? styles.mine : ''}`}
            aria-pressed={mine}
            aria-label={`${emoji} ${count}${mine ? ', ta réaction (retirer)' : ''}`}
            onClick={() => react(mine ? null : emoji)}
          >
            <span aria-hidden="true">{emoji}</span> {count}
          </button>
        );
      })}
      <button
        type="button"
        className={styles.add}
        aria-label="Réagir"
        aria-expanded={picking}
        onClick={() => setPicking((v) => !v)}
      >
        <SmilePlus size={18} strokeWidth={1.8} />
      </button>
      {picking && (
        <fieldset className={styles.picker}>
          <legend className={styles.legend}>Choisir une réaction</legend>
          {REACTION_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              className={`${styles.choice} ${local.mine === emoji ? styles.chosen : ''}`}
              onClick={() => react(local.mine === emoji ? null : emoji)}
              aria-label={emoji}
            >
              {emoji}
            </button>
          ))}
        </fieldset>
      )}
    </div>
  );
}
