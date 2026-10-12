import {
  customReactionId,
  customReactionImageUrl,
  isCustomReaction,
  MAX_REACTIONS_PER_PERSON,
  REACTION_EMOJIS,
  type ReactionKey,
  type Reactions,
} from '@picturart/shared';
import { Plus, SmilePlus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useCustomReactions } from '../lib/queries.ts';
import { EmojiPicker } from './EmojiPicker.tsx';
import styles from './ReactionBar.module.css';

interface ReactionBarProps {
  reactions: Reactions;
  /** Ajoute (`on`) ou retire une de ses réactions. */
  onReact: (key: ReactionKey, on: boolean) => void;
  /** Variante claire sur fond sombre (visionneuse). */
  onDark?: boolean;
}

/** Applique localement une réaction, pour un retour immédiat avant la réponse du serveur. */
export function applyReaction(current: Reactions, key: ReactionKey, on: boolean): Reactions {
  const has = current.mine.includes(key);
  if (has === on) return current;
  const counts = new Map(current.counts.map((c) => [c.emoji, c.count]));
  counts.set(key, (counts.get(key) ?? 0) + (on ? 1 : -1));
  return {
    mine: on ? [...current.mine, key] : current.mine.filter((k) => k !== key),
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
  const [allEmojis, setAllEmojis] = useState(false);
  const customs = useCustomReactions().data ?? [];
  const nameOf = useReactionName();
  useEffect(() => setLocal(reactions), [reactions]);

  const full = local.mine.length >= MAX_REACTIONS_PER_PERSON;

  /** Une réaction se pose ou se retire d'un appui ; on peut en cumuler plusieurs. */
  function toggle(key: ReactionKey) {
    const on = !local.mine.includes(key);
    if (on && full) return;
    setLocal((current) => applyReaction(current, key, on));
    setPicking(false);
    setAllEmojis(false);
    onReact(key, on);
  }

  return (
    <div className={`${styles.bar} ${onDark ? styles.dark : ''}`}>
      {local.counts.map(({ emoji, count }) => {
        const mine = local.mine.includes(emoji);
        const custom = isCustomReaction(emoji);
        return (
          <button
            key={emoji}
            type="button"
            className={`${styles.pill} ${mine ? styles.mine : ''} ${custom ? styles.customPill : ''}`}
            aria-pressed={mine}
            aria-label={`${nameOf(emoji)} ${count}${mine ? ', ta réaction (retirer)' : ''}`}
            title={custom ? nameOf(emoji) : undefined}
            onClick={() => toggle(emoji)}
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
        onClick={() => {
          setPicking((v) => !v);
          setAllEmojis(false);
        }}
      >
        <SmilePlus size={18} strokeWidth={1.8} />
      </button>
      {picking && (
        <fieldset className={styles.picker}>
          <legend className={styles.legend}>Choisir une réaction</legend>
          {full && (
            <p className={styles.full}>
              {MAX_REACTIONS_PER_PERSON} réactions au plus : retires-en une pour en mettre une
              autre.
            </p>
          )}
          <div className={styles.emojis}>
            {REACTION_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                className={`${styles.choice} ${local.mine.includes(emoji) ? styles.chosen : ''}`}
                onClick={() => toggle(emoji)}
                aria-label={emoji}
                aria-pressed={local.mine.includes(emoji)}
                disabled={full && !local.mine.includes(emoji)}
              >
                {emoji}
              </button>
            ))}
            <button
              type="button"
              className={styles.choice}
              onClick={() => setAllEmojis((v) => !v)}
              aria-label="Tous les emojis"
              aria-expanded={allEmojis}
              disabled={full}
            >
              <Plus size={20} strokeWidth={2} />
            </button>
          </div>
          {allEmojis && !full && <EmojiPicker onPick={(emoji) => toggle(emoji)} />}
          {customs.length > 0 && (
            <div className={styles.customs}>
              {customs.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className={`${styles.customChoice} ${local.mine.includes(c.key) ? styles.chosen : ''}`}
                  onClick={() => toggle(c.key)}
                  aria-label={c.name}
                  aria-pressed={local.mine.includes(c.key)}
                  disabled={full && !local.mine.includes(c.key)}
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
