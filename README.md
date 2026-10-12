# Pictur'Art

Le réseau social privé de la bande : vos soirées, vos voyages et vos têtes, en qualité originale.

- Envoi de photos et vidéos **en qualité originale** (4K incluse), en deux gestes
- Événements permanents, fil de posts, réactions emoji et réactions perso, commentaires
- Notifications push, souvenirs « il y a 1 an »
- PWA installable sur iOS et Android, auto-hébergée

> 🚧 En développement — jalon **M0 · Fondations**. Réécriture complète du projet de cours Pictur'Art.

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

Prérequis : Node 24, Docker. pnpm est fourni par Corepack (`corepack enable`).

```bash
pnpm install
pnpm db:up                                   # PostgreSQL dans Docker
cp apps/api/.env.example apps/api/.env
pnpm dev                                     # API sur :3000, PWA sur :5173
```

| Commande | Rôle |
|---|---|
| `pnpm check` | Lint et formatage (Biome) |
| `pnpm format` | Corrige le formatage |
| `pnpm typecheck` | Vérification des types |
| `pnpm test` | Tests (Vitest) |
| `pnpm build` | Build de production |

## Déploiement

Chaque push sur `main` passe la CI, construit les images `api` et `web` (GHCR), puis un runner auto-hébergé dans le conteneur de production les déploie. Détails : [architecture §8](docs/architecture.md#8-infrastructure--déploiement).
