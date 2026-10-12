import { type CreatedInvite, type Member, ROLE_LABELS, ROLES, type Role } from '@picturart/shared';
import { ChevronLeft } from 'lucide-react';
import { useId, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { Avatar } from '../components/Avatar.tsx';
import { InvitePanel } from '../components/InvitePanel.tsx';
import { ProfileLink } from '../components/ProfileLink.tsx';
import ui from '../components/ui.module.css';
import {
  useCreateInvite,
  useEvent,
  useMe,
  useRemoveMember,
  useUpdateMemberRole,
} from '../lib/queries.ts';
import ev from './EventsPage.module.css';
import styles from './pages.module.css';
import { Splash } from './Splash.tsx';

export function EventMembersPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { data: me } = useMe();
  const event = useEvent(id);
  const createInvite = useCreateInvite();
  const updateRole = useUpdateMemberRole(id);
  const remove = useRemoveMember(id);
  const [invite, setInvite] = useState<CreatedInvite | null>(null);

  if (event.isPending || !me) return <Splash />;
  if (event.isError) {
    return (
      <main className={`${styles.screen} ${styles.withNav}`}>
        <p className={ui.formError}>{event.error.message}</p>
      </main>
    );
  }
  const e = event.data;
  const isAdmin = e.role === 'admin';
  const error = updateRole.error ?? remove.error;

  return (
    <main className={`${styles.screen} ${styles.withNav}`}>
      <header className={styles.headerRow}>
        <Link to={`/evenements/${id}`} aria-label="Retour à l’événement" className={ui.iconButton}>
          <ChevronLeft size={20} strokeWidth={1.8} />
        </Link>
        <div style={{ minWidth: 0 }}>
          <div className={styles.lead} style={{ fontSize: 13 }}>
            {e.name}
          </div>
          <h1 className={ui.pageTitle} style={{ fontSize: 24 }}>
            {e.role === 'viewer' ? 'Membres' : 'Inviter la bande'}
          </h1>
        </div>
      </header>

      {e.role !== 'viewer' && (
        <section className={`${ui.card} ${ev.form}`}>
          {invite ? (
            <InvitePanel invite={invite} eventName={e.name} />
          ) : (
            <div className={styles.stack} style={{ gap: 10 }}>
              <p className={styles.lead}>
                Crée un lien à envoyer sur le groupe : chacun pourra rejoindre l'événement en un
                clic.
              </p>
              <button
                type="button"
                className={ui.button}
                onClick={() => createInvite.mutate(id, { onSuccess: setInvite })}
                disabled={createInvite.isPending}
              >
                Créer un lien d'invitation
              </button>
            </div>
          )}
        </section>
      )}

      <section className={styles.stack} style={{ gap: 8 }}>
        <h2 className={ui.label} style={{ margin: 0 }}>
          Membres · {e.memberCount}
        </h2>
        {error && (
          <p className={ui.formError} role="alert">
            {error.message}
          </p>
        )}
        <ul className={`${ui.card} ${ev.list}`} style={{ gap: 0 }}>
          {e.members.map((member) => (
            <MemberRow
              key={member.id}
              member={member}
              isMe={member.id === me.id}
              canEdit={isAdmin}
              onRole={(role) => updateRole.mutate({ userId: member.id, role })}
              onRemove={() => remove.mutate(member.id)}
            />
          ))}
        </ul>
      </section>

      <button
        type="button"
        className={ui.linkButton}
        style={{ alignSelf: 'flex-start' }}
        onClick={() => remove.mutate(me.id, { onSuccess: () => navigate('/evenements') })}
      >
        Quitter l'événement
      </button>
    </main>
  );
}

interface MemberRowProps {
  member: Member;
  isMe: boolean;
  canEdit: boolean;
  onRole: (role: Role) => void;
  onRemove: () => void;
}

function MemberRow({ member, isMe, canEdit, onRole, onRemove }: MemberRowProps) {
  const selectId = useId();
  return (
    <li
      className={styles.headerRow}
      style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)' }}
    >
      <ProfileLink user={member}>
        <Avatar id={member.id} name={member.displayName} size={36} />
      </ProfileLink>
      <span style={{ flex: 1, fontWeight: 600, fontSize: 15 }}>
        {member.displayName}
        {isMe && (
          <span className={styles.lead} style={{ fontSize: 13 }}>
            {' '}
            · toi
          </span>
        )}
      </span>
      {canEdit ? (
        <>
          <label htmlFor={selectId} className={ui.visuallyHidden}>
            Rôle de {member.displayName}
          </label>
          <select
            id={selectId}
            value={member.role}
            onChange={(event) => onRole(event.target.value as Role)}
            className={ui.input}
            style={{ width: 'auto', height: 36, padding: '0 8px', fontSize: 14 }}
          >
            {ROLES.map((role) => (
              <option key={role} value={role}>
                {ROLE_LABELS[role]}
              </option>
            ))}
          </select>
          {!isMe && (
            <button
              type="button"
              className={ui.linkButton}
              onClick={onRemove}
              aria-label={`Retirer ${member.displayName}`}
            >
              Retirer
            </button>
          )}
        </>
      ) : (
        <span className={styles.lead} style={{ fontSize: 13 }}>
          {ROLE_LABELS[member.role]}
        </span>
      )}
    </li>
  );
}
