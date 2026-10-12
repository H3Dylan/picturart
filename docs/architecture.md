# Pictur'Art — Architecture technique

> Version 0.1 — 12 octobre 2026 — proposition à valider
> S'appuie sur le [cahier des charges](cahier-des-charges.md), la [direction artistique](direction-artistique.md) et les [maquettes v1](https://claude.ai/artifact/V3CSdGfjjonFEmnf31beMD).

---

## 1. Vue d'ensemble

```mermaid
flowchart LR
  subgraph Téléphone
    PWA["PWA React<br/>(service worker)"]
  end
  subgraph Proxmox["Serveur Proxmox"]
    T["Traefik + CrowdSec<br/>(CT 102)"]
    subgraph CT107["CT 107 · picturart"]
      API["API Fastify<br/>REST · tus · WebSocket"]
      W["Worker<br/>(ffmpeg · libheif · QuickSync)"]
      DB[("PostgreSQL")]
      FS[("Médias<br/>dataset ZFS")]
    end
  end
  Push["Services Web Push<br/>(Apple / Google)"]

  PWA -- HTTPS --> T --> API
  API <--> DB
  W <--> DB
  API -- écrit les originaux --> FS
  W -- génère vignettes / vidéos --> FS
  W -- notifications --> Push --> PWA
  API -. WebSocket temps réel .-> PWA
```

- **Un seul serveur**, un seul conteneur LXC (CT 107) avec Docker Compose : API, worker, PostgreSQL.
- **L'API** gère l'authentification, les données, l'envoi des fichiers et le temps réel.
- **Le worker** fait le travail lourd en arrière-plan : vignettes, vidéos, notifications push, purge de la corbeille, souvenirs.
- Les deux partagent le même code (monorepo, même Dockerfile, deux cibles `api` et `worker`) et communiquent par la base (`LISTEN/NOTIFY`).

> **Décision M2** : pour les photos, le traitement tournait dans une file en mémoire à l'intérieur de l'API.
>
> **Décision M4** : avec les vidéos, le traitement passe dans un **conteneur `worker` séparé** (seul à embarquer ffmpeg, libheif et le pilote Intel, seul à accéder à l'iGPU, limité à 4 cœurs). **La file, c'est la table `media` elle-même** : un média `processing` non réservé est pris avec `SELECT … FOR UPDATE SKIP LOCKED`, l'API réveille le worker par `NOTIFY media_jobs`, le worker répond par `NOTIFY media_done` et l'API prévient les membres par WebSocket. Pas de pg-boss : une table et deux canaux suffisent pour une dizaine de personnes. Deux voies indépendantes (2 photos et 1 vidéo en parallèle) : une vidéo 4K ne bloque pas les photos. Un média qui fait tomber le worker 3 fois passe en échec. En développement et dans les tests, le même worker tourne dans le processus de l'API (`WORKER_INLINE`).

Ce découpage suffit largement pour une dizaine d'utilisateurs, tout en restant propre : rien n'empêche plus tard de séparer les services.

---

## 2. Stack

| Couche | Choix | Pourquoi |
|---|---|---|
| Langage | **TypeScript** partout | Un seul langage, types partagés front/back |
| Monorepo | **pnpm workspaces** | `apps/web`, `apps/api`, `packages/shared` |
| Front | **React 19 + Vite** | Continuité avec la v1, écosystème PWA mature |
| Routing front | **React Router 7** | Connu depuis la v1 |
| Données front | **TanStack Query** | Cache, pagination infinie du fil, mises à jour optimistes (réactions instantanées) |
| Styles | **CSS Modules + `design/tokens.css`** | Les tokens de la DA tels quels, sans framework |
| Icônes | **Lucide** | Style au trait de la DA |
| Polices | **@fontsource** (Rubik, Space Mono) | Auto-hébergées, pas d'appel à Google |
| PWA | Manifeste + **service worker maison** (`src/sw.ts`, entrée Vite à part) | Coquille hors ligne et push, sans dépendance (vite-plugin-pwa ne suit pas encore Vite 8) |
| Envoi de fichiers | **tus** (`tus-js-client` / `@tus/server`) | Envois reprenables, indispensables pour la 4K sur mobile |
| Back | **Fastify 5** | Rapide, typé, plugins officiels (cookies, rate-limit, websocket) |
| Validation | **Zod** (schémas dans `packages/shared`) | Mêmes règles côté client et serveur |
| Base | **PostgreSQL 17** | Relationnel, JSONB pour les notifications |
| ORM / migrations | **Drizzle ORM + drizzle-kit** | Requêtes SQL typées, migrations versionnées |
| Jobs | **PostgreSQL** (`SKIP LOCKED` + `LISTEN/NOTIFY`) | La table `media` sert de file : ni Redis ni pg-boss à maintenir |
| Images | **sharp** (libvips) + **libheif** (`heif-dec`) | Vignettes WebP rapides ; HEIC d'iPhone décodé par libheif (voir §5) |
| Métadonnées | **exifr** | Date de prise de vue, orientation, GPS |
| Vidéos | **ffmpeg 8** + Intel QuickSync (VA-API) | Décodage et encodage matériels sur l'iGPU de l'Optiplex |
| Mots de passe | **Argon2id** (`@node-rs/argon2`) | Recommandation OWASP |
| Push | **web-push** (VAPID) | Standard Web Push, sans service tiers |
| Tests | **Vitest** (unitaires + API), **Playwright** (bout en bout) | |
| CI | **GitHub Actions** | Lint, types, tests, build des images |
| Conteneurs | **Docker Compose**, images sur GHCR (privé) | |

---

## 3. Organisation du dépôt

```
picturart/
├── apps/
│   ├── web/                 # PWA React
│   │   ├── src/
│   │   │   ├── routes/      # écrans (fil, événement, visionneuse…)
│   │   │   ├── components/  # nav, carte post, planche contact, réactions…
│   │   │   ├── features/    # upload, temps réel, push
│   │   │   └── sw.ts        # service worker
│   │   └── public/
│   └── api/                 # Fastify + worker
│       ├── src/
│       │   ├── modules/     # auth, events, posts, media, reactions, comments…
│       │   ├── db/          # schéma Drizzle + migrations
│       │   ├── media/       # envoi tus, worker, photos, HEIC, vidéos
│       │   ├── server.ts    # point d'entrée API
│       │   └── worker.ts    # point d'entrée worker
│       └── test/
├── packages/
│   └── shared/              # schémas Zod, types, constantes (rôles, emojis…)
├── design/tokens.css
├── docs/
├── infra/                   # docker-compose, Traefik, scripts de déploiement
└── .github/workflows/
```

---

## 4. Modèle de données

```mermaid
erDiagram
  users ||--o{ sessions : "a"
  users ||--o{ event_members : "rejoint"
  events ||--o{ event_members : "regroupe"
  events ||--o{ invites : "a"
  events ||--o{ posts : "contient"
  users ||--o{ posts : "publie"
  posts ||--o{ media : "contient"
  media ||--o{ media_variants : "dérivés"
  posts ||--o{ comments : "a"
  posts ||--o{ reactions : "reçoit"
  media ||--o{ reactions : "reçoit"
  custom_reactions ||--o{ reactions : "utilisée par"
  users ||--o{ notifications : "reçoit"
  users ||--o{ push_subscriptions : "a"
```

| Table | Colonnes principales | Notes |
|---|---|---|
| `users` | `id`, `display_name`, `email` (unique), `password_hash`, `avatar_media_id`, `bio`, `theme` (`auto`/`light`/`dark`), `notification_prefs` (JSONB), `created_at` | |
| `sessions` | `id`, `user_id`, `token_hash`, `expires_at`, `user_agent`, `last_seen_at` | Cookie opaque, seul son hash est stocké |
| `events` | `id`, `name`, `starts_on`, `ends_on`, `location`, `cover_media_id`, `posting_policy` (`all`/`admins`), `created_by`, `created_at`, `archived_at` | Les « albums » permanents |
| `event_members` | `event_id`, `user_id`, `role` (`admin`/`contributor`/`viewer`), `joined_at`, `last_seen_at` | `last_seen_at` → badges « 12 new » |
| `invites` | `id`, `event_id`, `token_hash`, `default_role`, `created_by`, `expires_at`, `revoked_at`, `use_count` | Lien `/i/<token>` |
| `posts` | `id`, `event_id`, `author_id`, `caption`, `created_at`, `updated_at`, `deleted_at` | `deleted_at` = corbeille 30 jours |
| `media` | `id`, `post_id`, `uploader_id`, `kind` (`photo`/`video`), `status` (`uploading`/`processing`/`ready`/`failed`), `position`, `original_path`, `mime`, `size_bytes`, `sha256`, `width`, `height`, `duration_ms`, `taken_at`, `deleted_at` | `taken_at` (EXIF) trie la planche contact |
| `media_variants` | `media_id`, `variant` (`thumb`/`display`/`video`/`poster`), `path`, `width`, `height`, `size_bytes` | |
| `post_reactions` / `media_reactions` | `post_id` *ou* `media_id`, `user_id`, `emoji` (emoji ou `custom:<id>`), `created_at` | Plusieurs réactions par personne (6 au plus), chaque emoji une fois — demandé pendant la bêta |
| `custom_reactions` | `id`, `name`, `image_path`, `created_by`, `source_media_id`, `created_at` | « Tom choqué » ; utilisée via la clé `custom:<id>` dans `post_reactions` / `media_reactions` |
| `comments` | `id`, `post_id`, `author_id`, `body`, `created_at`, `edited_at`, `deleted_at` | |
| `notifications` | `id`, `user_id`, `type`, `payload` (JSONB), `read_at`, `created_at` | Alimente l'écran Activité |
| `push_subscriptions` | `id`, `user_id`, `endpoint`, `p256dh`, `auth`, `created_at` | Un abonnement par appareil |

**Règles clés en base** : clé `(post_id, user_id, emoji)` et `(media_id, user_id, emoji)` sur les réactions, clés étrangères en cascade sur les membres, index sur `(event_id, created_at)` pour le fil.

---

## 5. Pipeline des médias

C'est le cœur technique du projet : **originaux intacts, affichage rapide**.

```mermaid
sequenceDiagram
  participant P as PWA
  participant A as API
  participant W as Worker
  participant D as Disque (ZFS)
  P->>A: POST /posts (légende, événement, 5 médias)
  A-->>P: post + 5 emplacements d'envoi
  loop chaque fichier (morceaux de 8 Mo, reprenables)
    P->>A: PATCH /uploads/:id (tus)
    A->>D: écrit l'original
  end
  A->>A: vrai format (premiers octets), sha256
  A->>W: NOTIFY media_jobs
  W->>D: lit l'original (réservé avec SKIP LOCKED)
  W->>W: EXIF, dimensions, durée
  W->>D: vignette + version d'affichage (photo)<br/>ou version 1080p + aperçu (vidéo)
  W->>A: NOTIFY media_done
  A-->>P: WebSocket « média prêt »
  W->>W: notification push regroupée (après 2 min de calme)
```

### Photos
- **Original** stocké tel quel (JPEG, HEIC, PNG…), jamais modifié.
- **Vignette** 400 px et **affichage** 2048 px en WebP, rotation EXIF appliquée, **GPS retiré**.
- **HEIC** (iPhone) : les binaires de sharp ne décodent pas le HEVC (brevets). Le worker passe par **`heif-dec` de libheif 1.23** (Alpine) : rotation `irot` appliquée, orientation EXIF remise à « normale », profil couleur et date conservés, puis sharp comme pour un JPEG. La date est relue dans le JPEG décodé quand exifr ne sait pas lire l'EXIF du HEIC.
- Le format réel est reconnu à ses **premiers octets** (JPEG, PNG, WebP, boîte `ftyp` des HEIC/MP4/MOV), jamais à l'extension ; le décodage complet dans le worker rejette les fichiers corrompus.

### Vidéos
- **Original** conservé (jusqu'à 4K60, HEVC, HDR).
- **Version de lecture** MP4 H.264 (côté court 1080 px, 60 i/s max, AAC stéréo, `faststart`, **sans métadonnées** donc sans position GPS) + **aperçu** et vignette WebP tirés de cette version.
- **QuickSync via VA-API** (`intel-media-driver`) : décodage HEVC 10 bits et réduction sur l'iGPU, puis couleurs et rotation sur le CPU (en 1080p, c'est léger), encodage `h264_vaapi` sur l'iGPU. Si l'iGPU refuse un fichier, repli automatique en logiciel (`libx264`).
- Vidéos iPhone **HDR** (HLG) : `tonemap_vaapi` n'accepte que le HDR10 avec métadonnées, donc tonemapping `zscale` + `tonemap=hable` sur le CPU, vers le SDR BT.709.
- **Rotation** : les iPhone filment « couché » avec une matrice d'affichage ; elle est appliquée (`transpose`) et vérifiée contre la rotation automatique de ffmpeg.
- Mesures sur l'i5-8500T : 4K HDR portrait de 6 s → 1080×1920 en ~7 s (≈ temps réel) ; environ 3 fois plus de CPU sans l'iGPU.

### Stockage
```
/data/media/
├── originals/2026/10/<uuid>.<ext>
├── derived/<uuid>/thumb.webp | display.webp | video.mp4
├── tmp/<uuid>/         # fichiers intermédiaires du worker
└── uploads/            # morceaux tus en cours
```
- Dataset ZFS dédié `rpool/picturart`, monté dans le CT, avec **quota**.
- **Doublons** : `sha256` calculé à la réception ; un même fichier n'est stocké qu'une fois.

### Diffusion
- Route `GET /media/:id/:variant` : **vérifie que l'utilisateur est membre de l'événement**, puis envoie le fichier (avec gestion des plages HTTP pour la lecture vidéo).
- En-têtes `Cache-Control: private, max-age=31536000, immutable` : les fichiers ne changent jamais, le téléphone les garde en cache.

---

## 6. API

REST sous `/api/v1`, JSON, validée par Zod. Principales routes :

| Domaine | Routes |
|---|---|
| Auth | `POST /auth/login` · `POST /auth/logout` · `GET /me` · `PATCH /me` |
| Invitations | `GET /invites/:token` (aperçu public : événement, inviteur, nb de membres) · `POST /invites/:token/accept` (inscription ou ajout) · `POST /events/:id/invites` · `DELETE /invites/:id` |
| Événements | `GET /events` · `POST /events` · `GET /events/:id` · `PATCH /events/:id` · `DELETE /events/:id` |
| Membres | `GET /events/:id/members` · `PATCH /events/:id/members/:userId` (rôle) · `DELETE /events/:id/members/:userId` (retirer / quitter) |
| Fil & posts | `GET /feed?cursor=` · `GET /events/:id/posts?cursor=` · `GET /events/:id/media?sort=taken_at` (planche) · `POST /posts` · `PATCH /posts/:id` · `DELETE /posts/:id` |
| Envoi | `POST/PATCH/HEAD /uploads/*` (protocole tus) |
| Médias | `GET /media/:id/:variant` · `DELETE /media/:id` |
| Réactions | `PUT /posts/:id/reaction` · `DELETE /posts/:id/reaction` · idem sur `/media/:id/reaction` |
| Commentaires | `GET /posts/:id/comments` · `POST /posts/:id/comments` · `DELETE /comments/:id` |
| Réactions perso | `GET /custom-reactions` · `POST /custom-reactions` (recadrage d'un média) |
| Activité | `GET /notifications?cursor=` · `POST /notifications/read` |
| Push | `POST /push/subscriptions` · `DELETE /push/subscriptions/:id` |
| Planche contact | `GET /events/:id/media?tri=meilleures` (toutes les photos, ou les plus réactionnées) |
| Temps réel | `GET /ws` (WebSocket) |

- **Pagination par curseur** (`created_at` + `id`), pas par numéro de page : le fil reste stable quand de nouveaux posts arrivent.
- **Droits** vérifiés dans un hook commun : appartenance à l'événement, puis rôle (table du cahier des charges §6).

### Temps réel
- Une connexion WebSocket par appareil ; le serveur l'abonne aux événements dont l'utilisateur est membre.
- Messages : `post.created`, `post.deleted`, `media.ready`, `reaction.updated`, `comment.created`, `comment.deleted` et `notification.created`, envoyé au seul destinataire (écran Activité et pastille).
- **Décision M3** : les messages ne transportent que des identifiants, jamais de contenu. Le front invalide les requêtes TanStack Query concernées et relit l'API, qui refait le contrôle d'accès : pas de rechargement, et rien ne fuit par le canal temps réel.
- Hub en mémoire dans l'API (une instance suffit pour la bande) ; ping toutes les 25 s, reconnexion progressive côté PWA et au retour au premier plan.

### Notifications push
- Chaque action crée une ligne `notifications` par destinataire : post publié (toute la bande de l'événement), réaction et commentaire (l'auteur du post), arrivée d'un membre (écran Activité seulement). On ne se notifie jamais soi-même ; changer d'emoji remplace la notification, retirer une réaction ou supprimer un commentaire ou un post l'efface.
- **Décision M5** : l'écran Activité lit cette table directement ; l'envoi push est fait par le **worker** (`PushDispatcher`, toutes les 10 s), qui regroupe par destinataire les lignes pas encore poussées. Il attend **2 minutes de calme** quand des photos arrivent (30 s pour une rafale de réactions ou de commentaires, 10 minutes au plus), puis envoie **une seule notification** : « Léa a ajouté 17 photos et 2 vidéos ». Les lignes sont marquées avant l'envoi : au plus une fois, jamais en double.
- Préférences « Me prévenir quand… » (écran Mon profil) et **coupure par événement** (cloche de la page événement) respectées ; l'activité reste visible dans tous les cas.
- Web Push standard (VAPID, bibliothèque `web-push`), un abonnement par appareil ; ceux que le service de push déclare expirés (404, 410) sont supprimés. Les clés VAPID vivent dans le `.env` du serveur.
- Le service worker affiche la notification, met la **pastille** du nombre de non lues sur l'icône (Badging API) et, au clic, ramène l'app ouverte sur le bon écran.
- Sur iPhone, le push n'existe qu'une fois l'app **installée** (iOS 16.4+) : l'écran de bienvenue guide l'installation, et l'invitation à activer les notifications revient dans le fil une fois l'app ouverte depuis l'icône.

### Réactions perso, souvenirs et profils (M6)
- **Décision M6 — réactions perso** : une tête recadrée dans la version d'affichage d'une photo (déjà tournée, sans métadonnées), réduite à 160 × 160 px en WebP. Elles sont **communes à toute la bande** (tous les comptes de l'instance, qui n'existent que sur invitation), comme le promet l'écran de création ; la photo d'origine, elle, reste réservée aux membres de son événement. Une réaction stocke la clé `custom:<id>` dans la même colonne que les emojis : aucun changement des comptes et des regroupements. Seule la créatrice supprime la sienne, ce qui l'efface des posts et de l'activité ; 30 par personne au plus.
- **Souvenirs** : les journées passées (même jour et même mois, heure de Paris) des événements dont on est membre, d'après la date de prise de vue (sinon d'envoi), avec la photo la plus aimée. Carte en tête du fil, et chaque matin à partir de 9 h une notification « souvenir » par journée (tâche du worker, idempotente), poussée selon « Un souvenir refait surface ».
- **Profils** : visibles seulement avec au moins un événement en commun (sinon 404, comme pour les événements). Stats (posts, réactions reçues sans les siennes, réaction la plus reçue) et grille de photos calculées **sur les seuls événements partagés** : un profil ne dévoile rien d'un événement dont on n'est pas.

---

## 7. Sécurité

- **Sessions** : cookie `HttpOnly`, `Secure`, `SameSite=Lax`, durée 90 jours glissante ; seul le hash du jeton est en base.
- **CSRF** : `SameSite=Lax` + vérification de l'en-tête `Origin` sur toutes les requêtes qui modifient.
- **Mots de passe** : Argon2id ; limitation de débit sur la connexion et l'acceptation d'invitation (`@fastify/rate-limit`) ; CrowdSec devant.
- **Invitations** : jeton aléatoire de 128 bits, expiration, révocation, compteur d'usage.
- **Médias** : jamais servis sans contrôle d'appartenance ; noms de fichiers aléatoires (UUID) ; type réel vérifié (pas seulement l'extension).
- **Secrets** : uniquement dans un `.env` sur le serveur, jamais dans Git ; scan de secrets dans la CI.
- **En-têtes** : CSP stricte, HSTS (déjà via Traefik), `X-Content-Type-Options`.

---

## 8. Infrastructure & déploiement

### Sur le serveur Proxmox
| Élément | Valeur proposée |
|---|---|
| Conteneur | **CT 107 `picturart`** (ancien emplacement d'Immich, supprimé), Debian 13, 4 cœurs, 4 Go RAM, IP `192.168.1.107` |
| Médias | Dataset ZFS **`rpool/picturart`**, quota **500 Go** |
| GPU | `/dev/dri/renderD128` partagé avec le CT (`dev0 … gid=992`, groupe `render`), puis avec le conteneur `worker` (`group_add`) |
| Domaine | **`pictur.dylanbouillon.fr`** — route Traefik + CrowdSec, sur le modèle de `portfolio.yml` |
| Services | `docker compose` : `api`, `worker`, `postgres` |
| Sauvegardes | `pg_dump` quotidien dans le dataset + snapshots ZFS (sanoid) + sauvegarde Proxmox du CT ; **copie hors site toujours à mettre en place** |

### Chaîne CI/CD
1. **Pull request / push** → GitHub Actions : lint, vérification des types, tests (avec un PostgreSQL de test), build.
2. **Merge sur `main`** → construction des images Docker `api`, `worker` et `web`, publication sur GHCR (privé). Les tests de la CI installent ffmpeg et libheif pour couvrir vidéos et HEIC.
3. **Déploiement** : un **runner GitHub auto-hébergé dans le CT 107** récupère les nouvelles images et relance `docker compose`. Il ne fait que des connexions sortantes : aucun port à ouvrir sur le serveur.
4. Migrations de base appliquées automatiquement au démarrage de l'API.

### Environnements
- **Local** : `docker compose` (PostgreSQL) + `pnpm dev` (API et front en rechargement à chaud).
- **Production** : CT 107.
- Pas de préproduction au début ; on l'ajoutera si besoin.

---

## 9. Feuille de route

| Jalon | Contenu | Résultat |
|---|---|---|
| ✅ **M0 · Fondations** | Monorepo, CI, Docker, CT 107, Traefik, déploiement automatique | Une page « Pictur'Art arrive » en ligne sur `pictur.dylanbouillon.fr` |
| ✅ **M1 · Comptes** | Invitations, inscription, connexion, profil, thème clair/sombre | La bande peut créer son compte |
| ✅ **M2 · Événements & photos** | Événements, membres, rôles, création de post, envoi tus, vignettes | On peut poster des photos |
| ✅ **M3 · Social** | Fil, page événement (planche), visionneuse, réactions, commentaires, temps réel | L'expérience de base est complète |
| ✅ **M4 · Vidéos & HEIC** | Transcodage QuickSync, HDR, HEIC | Les médias iPhone passent sans souci |
| ✅ **M5 · PWA & notifs** | Installation, push regroupées, écran Activité | On est prévenu quand la bande poste |
| ✅ **M6 · Fun** | Réactions perso, souvenirs « il y a 1 an », stats de profil | La personnalité de l'app |
| **Bêta** | Ouverture à la bande, retours, corrections | v1.0 |

---

## 10. Points à valider en priorité (« spikes »)

Ce sont les risques techniques ; mieux vaut les lever tôt, avant de construire dessus :

1. ✅ **HEIC** : décodé par `heif-dec` (libheif 1.23, Alpine), rotation et date vérifiées (M4).
2. ✅ **Vidéo HDR + QuickSync** : chaîne hybride iGPU/CPU validée sur l'i5-8500T (M4). Reste à confirmer le rendu sur de vraies vidéos d'iPhone.
3. **Envoi depuis iOS Safari** : comportement de tus quand on verrouille le téléphone, reprise à la réouverture.
4. **Push sur iOS** : fonctionnement réel une fois la PWA installée sur l'écran d'accueil.
