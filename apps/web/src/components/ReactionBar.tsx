import {
  customReactionId,
  customReactionImageUrl,
  isCustomReaction,
  REACTION_EMOJIS,
  type ReactionKey,
  type Reactions,
} from '@picturart/shared';
import { SmilePlus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useCustomReactions } from '../lib/queries.ts';
import styles from './ReactionBar.module.css';

interface ReactionBarProps {
  reactions: Reactions;
  onReact: (key: ReactionKey | null) => void;
  /** Variante claire sur fond sombre (visionneuse). */
  onDark?: boolean;
}

/** Applique localement une réaction, pour un retour immédiat avant la réponse du serveur. */
export function applyReaction(current: Reactions, key: ReactionKey | null): Reactions {
  const counts = new Map(current.counts.map((c) => [c.emoji, c.count]));
  if (current.mine) counts.set(current.mine, (counts.get(current.mine) ?? 1) - 1);
  if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
  return {
    mine: key,
    counts: [...counts]
      .filter(([, count]) => count > 0)
      .map(([emoji, count]) => ({ emoji, count }))
      .sort((a, b) => b.count - a.count),
  };
}

/** Nom lisible d'une réaction (pour les lecteurs d'écran et les infobulles). */
export function useReactionName() {
  const customs = useCustomReactions().data ?? [];
  return (key: ReactionKey) =>
    isCustomReaction(key) ? (customs.find((c) => c.key === key)?.name ?? 'réaction perso') : key;
}

/** Emoji, ou vignette de la réaction perso. */
export function ReactionGlyph({ reaction, size = 20 }: { reaction: ReactionKey; size?: number }) {
  if (!isCustomReaction(reaction)) return <span aria-hidden="true">{reaction}</span>;
  return (
    <img
      src={customReactionImageUrl(customReactionId(reaction))}
      alt=""
      width={size}
      height={size}
      className={styles.sticker}
    />
  );
}

export function ReactionBar({ reactions, onReact, onDark = false }: ReactionBarProps) {
  const [local, setLocal] = useState(reactions);
  const [picking, setPicking] = useState(false);
  const customs = useCustomReactions().data ?? [];
  const nameOf = useReactionName();
  useEffect(() => setLocal(reactions), [reactions]);

  function react(key: ReactionKey | null) {
    setLocal((current) => applyReaction(current, key));
    setPicking(false);
    onReact(key);
  }

  return (
    <div className={`${styles.bar} ${onDark ? styles.dark : ''}`}>
      {local.counts.map(({ emoji, count }) => {
        const mine = local.mine === emoji;
        const custom = isCustomReaction(emoji);
        return (
          <button
            key={emoji}
            type="button"
            className={`${styles.pill} ${mine ? styles.mine : ''} ${custom ? styles.customPill : ''}`}
            aria-pressed={mine}
            aria-label={`${nameOf(emoji)} ${count}${mine ? ', ta réaction (retirer)' : ''}`}
            title={custom ? nameOf(emoji) : undefined}
            onClick={() => react(mine ? null : emoji)}
          >
            <ReactionGlyph reaction={emoji} size={24} />
            {custom && <span className={styles.customName}>{nameOf(emoji)}</span>} {count}
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
          <div className={styles.emojis}>
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
          </div>
          {customs.length > 0 && (
            <div className={styles.customs}>
              {customs.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className={`${styles.customChoice} ${local.mine === c.key ? styles.chosen : ''}`}
                  onClick={() => react(local.mine === c.key ? null : c.key)}
                  aria-label={c.name}
                  title={c.name}
                >
                  <ReactionGlyph reaction={c.key} size={40} />
                  <span>{c.name}</span>
                </button>
              ))}
            </div>
          )}
        </fieldset>
      )}
    </div>
  );
}
