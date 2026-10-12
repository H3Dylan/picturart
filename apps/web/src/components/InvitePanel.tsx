import type { CreatedInvite } from '@picturart/shared';
import { Copy, Share } from 'lucide-react';
import { useState } from 'react';
import styles from './InvitePanel.module.css';
import ui from './ui.module.css';

export function InvitePanel({ invite, eventName }: { invite: CreatedInvite; eventName: string }) {
  const [copied, setCopied] = useState(false);
  const canShare = typeof navigator.share === 'function';

  async function copy() {
    try {
      await navigator.clipboard.writeText(invite.url);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  async function share() {
    try {
      await navigator.share({
        title: eventName,
        text: `Rejoins « ${eventName} » sur Pictur'Art`,
        url: invite.url,
      });
    } catch {
      // partage annulé
    }
  }

  return (
    <div className={styles.panel}>
      <p className={ui.meta}>Lien d'invitation</p>
      <p className={styles.url}>{invite.url}</p>
      <div className={styles.actions}>
        <button type="button" className={`${ui.buttonSecondary} ${ui.buttonSmall}`} onClick={copy}>
          <Copy size={16} strokeWidth={1.8} aria-hidden="true" />
          {copied ? 'Copié !' : 'Copier'}
        </button>
        {canShare && (
          <button type="button" className={`${ui.button} ${ui.buttonSmall}`} onClick={share}>
            <Share size={16} strokeWidth={1.8} aria-hidden="true" />
            Partager
          </button>
        )}
      </div>
      <p className={styles.note}>Expire dans 7 jours · les nouveaux arrivent en contributeur</p>
    </div>
  );
}
