import { customReactionImageUrl, mediaUrl } from '@picturart/shared';
import { ChevronLeft } from 'lucide-react';
import { type FormEvent, type PointerEvent, useId, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { TextField } from '../components/TextField.tsx';
import ui from '../components/ui.module.css';
import { ApiError } from '../lib/api.ts';
import { useCreateCustomReaction, useCustomReactions } from '../lib/queries.ts';
import c from './CreateReactionPage.module.css';
import styles from './pages.module.css';

interface Crop {
  /** Centre du cadre, en fractions de l'image. */
  cx: number;
  cy: number;
  /** Côté du cadre, en fraction du plus petit côté de l'image. */
  size: number;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** Cadre carré en fractions de largeur et de hauteur (ce qu'attend l'API). */
function toBox(crop: Crop, ratio: number) {
  // ratio = largeur / hauteur de l'image
  const width = ratio >= 1 ? crop.size / ratio : crop.size;
  const height = ratio >= 1 ? crop.size : crop.size * ratio;
  return {
    x: clamp(crop.cx - width / 2, 0, 1 - width),
    y: clamp(crop.cy - height / 2, 0, 1 - height),
    width,
    height,
  };
}

/**
 * « Nouvelle réaction perso » : recadrer une tête dans une photo et lui donner un nom.
 * Toute la bande pourra ensuite l'utiliser comme réaction.
 */
export function CreateReactionPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const mediaId = params.get('media') ?? '';
  const create = useCreateCustomReaction();
  const existing = useCustomReactions().data ?? [];
  const zoomId = useId();
  const [name, setName] = useState('');
  const [ratio, setRatio] = useState<number | null>(null);
  const [crop, setCrop] = useState<Crop>({ cx: 0.5, cy: 0.4, size: 0.45 });
  const drag = useRef<{ x: number; y: number; crop: Crop } | null>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const box = ratio ? toBox(crop, ratio) : null;
  const errors = create.error instanceof ApiError ? create.error.fields : {};

  const back = () => (window.history.length > 1 ? navigate(-1) : navigate('/fil'));

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { x: event.clientX, y: event.clientY, crop };
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    const start = drag.current;
    const image = imageRef.current;
    if (!start || !image || !box) return;
    const dx = (event.clientX - start.x) / image.clientWidth;
    const dy = (event.clientY - start.y) / image.clientHeight;
    setCrop({
      ...start.crop,
      cx: clamp(start.crop.cx + dx, box.width / 2, 1 - box.width / 2),
      cy: clamp(start.crop.cy + dy, box.height / 2, 1 - box.height / 2),
    });
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!box) return;
    create.mutate({ mediaId, name, crop: box }, { onSuccess: back });
  }

  if (!mediaId) {
    return (
      <main className={styles.screen}>
        <h1 className={ui.pageTitle}>Choisis d'abord une photo</h1>
        <p className={styles.lead}>
          Ouvre une photo et appuie sur « Réaction perso » pour recadrer une tête.
        </p>
      </main>
    );
  }

  const display = mediaUrl(mediaId, 'display');
  // Aperçu : la photo en fond, agrandie pour que le cadre remplisse la vignette
  const preview = box && {
    backgroundImage: `url(${display})`,
    backgroundSize: `${100 / box.width}% ${100 / box.height}%`,
    backgroundPosition: `${box.width < 1 ? (box.x / (1 - box.width)) * 100 : 0}% ${
      box.height < 1 ? (box.y / (1 - box.height)) * 100 : 0
    }%`,
  };

  return (
    <main className={styles.screen}>
      <header className={c.header}>
        <button type="button" className={ui.iconButton} onClick={back} aria-label="Retour">
          <ChevronLeft size={20} strokeWidth={1.8} />
        </button>
        <h1 className={c.title}>Nouvelle réaction perso</h1>
      </header>
      <p className={styles.lead} style={{ margin: 0 }}>
        Recadre une tête, donne-lui un nom : toute la bande pourra l'utiliser comme réaction.
      </p>

      <div className={c.stage}>
        <div className={c.frame}>
          <img
            ref={imageRef}
            src={display}
            alt="À recadrer"
            className={c.image}
            draggable={false}
            onLoad={(e) =>
              setRatio(e.currentTarget.naturalWidth / e.currentTarget.naturalHeight || 1)
            }
          />
          {box && (
            <div
              className={c.crop}
              style={{
                left: `${box.x * 100}%`,
                top: `${box.y * 100}%`,
                width: `${box.width * 100}%`,
                height: `${box.height * 100}%`,
              }}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={() => {
                drag.current = null;
              }}
              role="presentation"
            />
          )}
        </div>
        <span className={c.hint}>GLISSE LE CADRE</span>
      </div>

      <form className={styles.stack} onSubmit={submit} noValidate>
        <div className={ui.field}>
          <label htmlFor={zoomId} className={ui.label}>
            Zoom
          </label>
          <input
            id={zoomId}
            type="range"
            min={0.12}
            max={1}
            step={0.01}
            value={1.12 - crop.size}
            onChange={(e) =>
              setCrop((current) => ({ ...current, size: 1.12 - Number(e.target.value) }))
            }
            className={c.range}
          />
        </div>

        <div className={c.nameRow}>
          <span className={c.preview} style={preview ?? undefined} aria-hidden="true" />
          <div style={{ flex: 1 }}>
            <TextField
              label="Nom de la réaction"
              placeholder="Tom choqué"
              maxLength={24}
              value={name}
              onChange={(e) => setName(e.target.value)}
              error={errors.name ?? errors.crop}
            />
          </div>
        </div>

        {create.error && !Object.keys(errors).length && (
          <p className={ui.formError} role="alert">
            {create.error.message}
          </p>
        )}

        {existing.length > 0 && (
          <section>
            <p className={ui.metaAccent}>DÉJÀ DANS LA BANDE · {existing.length}</p>
            <ul className={c.existing}>
              {existing.map((r) => (
                <li key={r.id}>
                  <img src={customReactionImageUrl(r.id)} alt="" className={c.sticker} />
                  <span>{r.name}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <button
          type="submit"
          className={ui.button}
          disabled={!box || !name.trim() || create.isPending}
        >
          {create.isPending ? 'Création…' : 'Créer la réaction'}
        </button>
      </form>
    </main>
  );
}
