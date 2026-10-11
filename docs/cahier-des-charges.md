# Pictur'Art — Cahier des charges

> Version 0.1 — 11 octobre 2026 — Dylan Bouillon
> Statut : brouillon à valider avant la phase DA / maquettes

---

## 1. Contexte

Pictur'Art est né comme projet de cours : une PWA d'albums photo privés avec réactions et commentaires (React, Express, MongoDB). Cette v2 est une **réécriture complète**, pensée pour un usage réel et comme projet vitrine de portfolio.

Avant de se lancer, [Immich](https://immich.app) a été testé sur le serveur perso. Verdict : excellent pour *sauvegarder* une photothèque, mais pas adapté à notre usage. Il pousse à synchroniser toute sa galerie, ajouter une photo à un album demande trop de clics, et l'aspect social (réactions, activité) est secondaire.

### Objectif

> **Partager des photos entre potes aussi simplement que sur WhatsApp, avec la qualité et la mise en valeur d'un vrai album souvenir.**

### Ce qui fait la différence

| | WhatsApp | Immich / Google Photos | **Pictur'Art** |
|---|---|---|---|
| Envoyer une photo | 2 gestes | Synchro de galerie ou menu caché | **2 gestes** |
| Qualité | Compressée | Originale | **Originale (4K incluse)** |
| Organisation | Noyée dans la conversation | Albums | **Albums** |
| Réactions / activité | Oui | Minimal | **Au centre de l'expérience** |
| Données | Chez Meta | Chez Google / auto-hébergé | **Auto-hébergé** |

---

## 2. Utilisateurs

Un groupe d'environ **10 potes**. Pas d'inscription publique : on n'entre que sur invitation.

### Personas

**Dylan — l'organisateur.** Crée les albums après chaque soirée, week-end ou voyage, et invite les autres. Veut que tout le monde poste sans qu'il ait à relancer ni à expliquer.

**Léa — la contributrice.** Prend plein de photos et de vidéos 4K avec son téléphone. Veut les balancer dans l'album en quelques secondes, en pleine qualité, sans trier sa galerie ni attendre devant l'écran.

**Max — le spectateur.** Poste peu mais regarde tout, réagit et commente. Ouvre l'app quand une notification lui dit qu'il y a du nouveau. Ne lira jamais un tutoriel.

---

## 3. Principes UX

Ces règles servent d'arbitre pour toutes les décisions de design :

1. **Deux gestes maximum** pour les actions fréquentes : poster, réagir, ouvrir un album.
2. **L'action principale est toujours visible.** Le bouton « ajouter » ne se cache jamais dans un menu « … ».
3. **Rien à synchroniser.** On choisit ses photos, on les envoie, c'est tout.
4. **Mobile d'abord.** Le desktop doit marcher, mais chaque écran est conçu pour un pouce.
5. **Les photos sont les héroïnes.** L'interface s'efface : peu de texte, pas de bordures inutiles, du plein écran.
6. **On voit que les autres sont là.** Activité, réactions, avatars : l'app doit donner envie de répondre.
7. **Jamais de perte.** Un envoi interrompu reprend où il en était, et l'original est conservé intact.

---

## 4. Parcours clés

### P1 — Rejoindre (premier contact)
1. Dylan copie le **lien d'invitation** de l'album et l'envoie sur le groupe WhatsApp.
2. Max clique : il voit la couverture de l'album, qui l'invite et combien de photos il contient.
3. Il choisit un prénom, un avatar (facultatif) et un mot de passe. Il est dans l'album.
4. L'app lui propose de **l'installer sur l'écran d'accueil**, puis d'**activer les notifications**.

*Objectif : moins d'une minute, sans aucune explication.*

### P2 — Poster des photos
1. Léa ouvre l'album et appuie sur le gros bouton **+**.
2. Le sélecteur natif du téléphone s'ouvre. Elle coche 15 photos et 2 vidéos.
3. Les vignettes apparaissent **immédiatement** dans l'album, avec une progression sur chacune.
4. Elle peut fermer l'app : l'envoi continue autant que le système le permet, puis reprend à la prochaine ouverture.

### P3 — Réagir
- **Double-tap** sur une photo : ❤️.
- **Appui long** : barre d'emojis (❤️ 😂 🔥 😍 😮 👏).
- Icône bulle : commentaires de la photo.

### P4 — Être tenu au courant
- Notification push : *« Léa a ajouté 17 photos dans Week-end Bretagne »*. Les envois sont regroupés : une seule notification par salve, pas 17.
- Notification push : *« Max a réagi 😂 à ta photo »*, *« Max a commenté ta photo »*.
- Écran **Activité** : fil chronologique de tout ce qui s'est passé dans mes albums.

### P5 — Revoir et récupérer
- Visionneuse plein écran : swipe entre photos, vidéos lues en streaming, zoom.
- **Télécharger l'original** d'une photo ou vidéo.

---

## 5. Fonctionnalités

Priorisation MoSCoW : **M** = indispensable au MVP, **S** = juste après le MVP, **C** = plus tard, **W** = hors périmètre.

### Comptes & accès
| ID | Fonctionnalité | Prio |
|---|---|---|
| A1 | Inscription **uniquement via lien d'invitation** (prénom, mot de passe, avatar facultatif) | M |
| A2 | Connexion e-mail + mot de passe, session longue durée (on ne se reconnecte pas tous les jours) | M |
| A3 | Profil : prénom, avatar, préférences de notifications | M |
| A4 | Mot de passe oublié par e-mail | S |
| A5 | Connexion par passkey (Face ID / empreinte) | C |
| A6 | Suppression de son compte et de ses données (RGPD) | S |

### Albums
| ID | Fonctionnalité | Prio |
|---|---|---|
| B1 | Créer un album : nom, c'est tout. La couverture est automatique (première photo) et modifiable. | M |
| B2 | Liste de mes albums, triée par activité récente, avec un badge « nouveau » | M |
| B3 | Lien d'invitation par album, régénérable / révocable | M |
| B4 | Membres et rôles : admin, contributeur, lecteur (voir §6) | M |
| B5 | Quitter un album | M |
| B6 | Description, date et lieu de l'album (« événement ») | S |
| B7 | Lien public en lecture seule, avec expiration | C |
| B8 | Archiver / supprimer un album | S |

### Médias
| ID | Fonctionnalité | Prio |
|---|---|---|
| C1 | Envoi multiple photos + vidéos depuis le sélecteur natif | M |
| C2 | **Conservation de l'original intact** (y compris 4K, HEIC, HDR) | M |
| C3 | Envoi **reprenable** (une coupure réseau ne relance pas tout) | M |
| C4 | Génération de vignettes et de versions d'affichage légères | M |
| C5 | Vidéos : version de lecture streaming + image d'aperçu, original conservé | M |
| C6 | Visionneuse plein écran, swipe, zoom | M |
| C7 | Télécharger l'original | M |
| C8 | Supprimer **ses propres** médias | M |
| C9 | Tri chronologique par date de prise de vue (EXIF), pas par date d'envoi | M |
| C10 | Détection des doublons à l'envoi | S |
| C11 | Télécharger tout un album (zip) | S |
| C12 | Envoi en arrière-plan avancé (Background Sync) | C |

### Social
| ID | Fonctionnalité | Prio |
|---|---|---|
| D1 | Réactions emoji sur un média (une réaction par personne, modifiable) | M |
| D2 | Double-tap = ❤️ | M |
| D3 | Commentaires sur un média | M |
| D4 | Mises à jour en temps réel (réactions, commentaires, nouvelles photos) sans recharger | M |
| D5 | Fil d'activité global | M |
| D6 | Notifications push regroupées, réglables par album | M |
| D7 | Mentions @prénom dans les commentaires | C |
| D8 | Réponses aux commentaires | C |

### Hors périmètre (W)
- Synchronisation automatique de la galerie (c'est le rôle d'Immich / Google Photos)
- Retouche photo, filtres
- Réseau social public, découverte d'albums inconnus
- Applications natives sur les stores (la PWA suffit ; à réévaluer plus tard)

---

## 6. Règles de gestion

### Droits par rôle

| Action | Admin | Contributeur | Lecteur |
|---|:---:|:---:|:---:|
| Voir l'album, réagir, commenter | ✅ | ✅ | ✅ |
| Ajouter des photos / vidéos | ✅ | ✅ | ❌ |
| Supprimer **ses** médias | ✅ | ✅ | — |
| Supprimer les médias **des autres** | ❌ *(à rediscuter)* | ❌ | ❌ |
| Inviter (partager le lien) | ✅ | ✅ | ❌ |
| Changer les rôles, retirer un membre | ✅ | ❌ | ❌ |
| Renommer, changer la couverture | ✅ | ❌ | ❌ |
| Supprimer l'album | ✅ (créateur) | ❌ | ❌ |

- Le créateur d'un album en est admin. Il peut nommer d'autres admins.
- Rôle par défaut via le lien d'invitation : **contributeur**.
- Un commentaire ne peut être supprimé que par son auteur.
- Quand un membre quitte un album, ses photos y restent (décision à confirmer).

### Suppression
- Seul l'auteur supprime ses médias (décision du 11/10/2026, à réévaluer à l'usage).
- La suppression est d'abord une **corbeille de 30 jours** (restauration possible par l'auteur), puis l'effacement est définitif.

---

## 7. Exigences non fonctionnelles

### Qualité & médias
- Originaux conservés **à l'octet près** (aucune recompression), téléchargeables.
- Formats : JPEG, PNG, HEIC/HEIF, WebP ; vidéos MP4/MOV (H.264, HEVC), jusqu'à la 4K60 et le HDR.
- Taille max d'un fichier : **4 Go** (≈ 10 min de 4K).
- Versions dérivées : vignette (~400 px), affichage (~2048 px) en WebP/AVIF ; vidéo de lecture 1080p H.264 + poster.
- Les coordonnées GPS sont **retirées des versions affichées**, conservées dans l'original téléchargeable.

### Performance
- Liste des albums et fil affichés en **< 1 s** en 4G (vignettes légères, chargement progressif).
- Les vignettes d'une photo envoyée apparaissent localement **instantanément**, avant la fin de l'envoi.
- Transcodage vidéo accéléré matériellement (Intel QuickSync du serveur).

### PWA
- Installable sur iOS (16.4+) et Android, icône et écran de démarrage.
- Notifications push (Web Push) sur les deux plateformes, une fois l'app installée.
- Coquille de l'app disponible hors ligne ; consultation des albums déjà vus en cache (S).

### Sécurité & vie privée
- Sessions par cookie `HttpOnly` / `Secure` / `SameSite` (pas de jeton dans le `localStorage`).
- Mots de passe hachés (Argon2id), limitation de débit sur l'authentification.
- Les médias ne sont **jamais** accessibles sans être membre de l'album (URLs signées ou contrôle d'accès à chaque requête).
- Aucun secret dans le dépôt Git (leçon de la v1).
- RGPD : données minimales, hébergement en France, export et suppression de ses données, mentions légales.

### Accessibilité
- Contrastes WCAG AA, cibles tactiles ≥ 44 px, navigation au clavier sur desktop, textes alternatifs sur l'interface.

### Fiabilité
- Sauvegardes automatiques de la base et des médias (snapshots ZFS + copie hors site, cf. infra).
- Mises à jour sans perte de données (migrations versionnées).

---

## 8. Volumétrie estimée

Hypothèse pour 10 personnes actives :

| Contenu | Volume / an |
|---|---|
| ~5 000 photos originales (3–6 Mo) | ~25 Go |
| ~150 vidéos 4K d'1 min en moyenne (170–400 Mo/min) | ~25–60 Go |
| Versions dérivées (vignettes, affichage, streaming) | +15 % |
| **Total** | **≈ 60–100 Go / an** |

Le serveur actuel (SSD 1 To partagé) tient plusieurs années. Les médias iront dans un dataset ZFS dédié, avec un quota pour protéger les autres services.

---

## 9. Choix techniques (proposition)

| Couche | Choix | Justification |
|---|---|---|
| Front | **React + Vite + TypeScript**, PWA (Workbox) | Continuité avec la v1, typage, PWA maîtrisée |
| Données front | TanStack Query | Cache, synchro, mises à jour optimistes (réactions instantanées) |
| Back | **Node + Fastify + TypeScript** | Rigoureux, performant, proche d'Express |
| Base de données | **PostgreSQL + Drizzle ORM** | Données relationnelles (membres, rôles, réactions) |
| Envoi de fichiers | Protocole **tus** (envois reprenables) | Indispensable pour la 4K sur mobile |
| Traitement images | sharp / libvips (+ libheif pour le HEIC) | Vignettes WebP/AVIF rapides |
| Traitement vidéo | ffmpeg + Intel QuickSync | iGPU du serveur, HDR → SDR |
| Tâches de fond | File de jobs sur PostgreSQL (pg-boss) | Pas de Redis à maintenir |
| Temps réel | WebSocket | Réactions et photos en direct |
| Notifications | Web Push (VAPID) | Natif PWA, sans service tiers |
| Tests | Vitest, Playwright | Unitaires + parcours bout en bout |
| CI/CD | GitHub Actions → images Docker → déploiement sur le serveur | |

### Hébergement
- Conteneur LXC dédié sur le Proxmox perso, derrière Traefik + CrowdSec.
- Domaine : `pictur.dylanbouillon.fr` (proposition).
- Médias sur un dataset ZFS dédié avec snapshots automatiques.

---

## 10. Leçons de la v1

| v1 (projet de cours) | v2 |
|---|---|
| Une seule photo par envoi | Envoi multiple, reprenable |
| Invitation par pseudo exact, compte préalable obligatoire | Lien d'invitation, inscription intégrée |
| Pas de notifications | Push + fil d'activité + temps réel |
| Réaction via un petit bouton « + » | Double-tap + appui long |
| Jeton JWT dans le `localStorage`, routes non protégées | Sessions `HttpOnly`, contrôle d'accès systématique |
| Identifiants de base de données dans le dépôt | Secrets hors dépôt, CI qui les détecte |
| MongoDB pour des données relationnelles | PostgreSQL |
| CSS différent sur chaque page | Design system (tokens, composants) |
| Fichiers servis publiquement depuis `/uploads` | Médias servis uniquement aux membres |

---

## 11. Risques & points ouverts

| Sujet | Risque / question | Piste |
|---|---|---|
| HEIC | Les binaires standards de sharp ne décodent pas le HEIC (brevets HEVC) | libvips compilé avec libheif, ou conversion via ffmpeg |
| Vidéos iPhone HDR (Dolby Vision) | Couleurs délavées si mal converties | Tonemapping ffmpeg, à tester sur de vrais fichiers |
| Envoi en arrière-plan iOS | Safari suspend les PWA en arrière-plan | Envoi reprenable + reprise à l'ouverture, attentes réalistes dans l'UI |
| Push iOS | Ne fonctionne que si l'app est installée sur l'écran d'accueil | Onboarding qui guide l'installation |
| Suppression par l'admin | Faut-il permettre à l'admin de retirer une photo gênante ? | À trancher après les premiers usages |
| Membre qui quitte | Ses photos restent-elles ? | Proposé : oui |
| Stockage | SSD unique partagé avec Immich (quota 500 Go) | Dataset dédié + quota ; libérer Immich si abandonné |

---

## 12. Prochaines étapes

1. ✅ Besoins (ce document) — **à valider**
2. ⏳ Direction artistique : moodboard, palette, typographie, iconographie, ton, à partir de l'identité v1 (orange #F26522, turquoise #2BB4BB)
3. ⏳ Maquettes : onboarding / invitation, liste des albums, album, envoi, visionneuse, activité, profil
4. ⏳ Architecture détaillée : modèle de données, API, infra
5. ⏳ Développement du MVP
6. ⏳ Bêta avec le groupe, retours, itérations
