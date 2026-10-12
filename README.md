# Pictur'Art

Le réseau social privé de la bande : vos soirées, vos voyages et vos têtes, en qualité originale.

- Envoi de photos et vidéos **en qualité originale** (4K incluse), en deux gestes
- Événements permanents, fil de posts, réactions emoji et réactions perso, commentaires
- Notifications push, souvenirs « il y a 1 an »
- PWA installable sur iOS et Android, auto-hébergée

> 🚧 En développement — **M0** à **M6 · Fun** ✅ en ligne sur [pictur.dylanbouillon.fr](https://pictur.dylanbouillon.fr), prochaine étape : **bêta avec la bande**. Réécriture complète du projet de cours Pictur'Art.

## Documentation

- [Cahier des charges](docs/cahier-des-charges.md)
- [Direction artistique](docs/direction-artistique.md) — tokens : [`design/tokens.css`](design/tokens.css)
- [Architecture technique](docs/architecture.md)
- [Maquettes v1](https://claude.ai/artifact/V3CSdGfjjonFEmnf31beMD) — 17 écrans cliquables, thèmes clair et sombre

## Stack

TypeScript · React 19 + Vite · Fastify 5 · PostgreSQL 17 + Drizzle · pnpm workspaces · Biome · Vitest · Docker · GitHub Actions

```
apps/web         PWA React
apps/api         API Fastify (Node 24 exécute le TypeScript directement)
packages/shared  Schémas Zod et types partagés
design/          Tokens de la direction artistique
infra/           Docker Compose, Traefik, scripts serveur
```

## Développer en local

Prérequis : Node 24. pnpm est fourni par Corepack (`corepack enable`). Docker est facultatif : par défaut, l'API utilise PostgreSQL embarqué (PGlite).

```bash
pnpm install
cp apps/api/.env.example apps/api/.env
pnpm --filter @picturart/api seed:dev        # compte et événement de démo (identifiants dans .env)
pnpm dev                                     # API sur :3000, PWA sur :5173
```

Les tests de l'API tournent eux aussi sur PGlite, sans Docker.

En local, les médias sont traités dans le processus de l'API (en production, par le conteneur `worker`). Les photos JPEG, PNG et WebP marchent tout de suite. Pour les vidéos et le HEIC, il faut `ffmpeg`/`ffprobe` et `heif-dec` (libheif) dans le `PATH`. Sans eux, ces fichiers finissent en échec et les tests correspondants sont sautés. Autre option : faire tourner l'API sur une machine équipée et y brancher la PWA avec `API_PROXY=http://<machine>:3000 pnpm --filter @picturart/web dev`.

Le service worker (hors ligne, notifications push) n'est actif que sur la version construite : `pnpm --filter @picturart/web preview:build` (port 4173, avec `APP_ORIGIN=http://localhost:4173` pour l'API). Les notifications push demandent une paire de clés VAPID dans `apps/api/.env` (voir `.env.example`) ; sans elles, l'écran Activité fonctionne seul.

## Premier compte en production

Les inscriptions passent uniquement par des liens d'invitation. Le tout premier compte (admin) et son premier événement se créent sur le serveur, en ligne de commande. Le mot de passe est demandé de façon masquée :

```bash
docker compose -f /srv/picturart/compose.yml exec -it api node src/cli/create-event.ts
```

Le script affiche ensuite un lien d'invitation à partager avec la bande.

| Commande | Rôle |
|---|---|
| `pnpm check` | Lint et formatage (Biome) |
| `pnpm format` | Corrige le formatage |
| `pnpm typecheck` | Vérification des types |
| `pnpm test` | Tests (Vitest) |
| `pnpm build` | Build de production |

## Déploiement

Chaque push sur `main` passe la CI, construit les images `api` et `web` (GHCR), puis un runner auto-hébergé dans le conteneur de production les déploie. Détails : [architecture §8](docs/architecture.md#8-infrastructure--déploiement).
