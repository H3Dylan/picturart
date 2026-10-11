# Pictur'Art — Direction artistique

> Version 1.0 — 11 octobre 2026 — validée
> Maquettes de référence : canvas « Pistes d'ambiance », piste **E · Argentique rangé**
> Variables prêtes à l'emploi : [`design/tokens.css`](../design/tokens.css)

---

## 1. L'idée

**L'esprit de la pellicule, la clarté d'une app moderne.**

Pictur'Art emprunte son vocabulaire visuel à la photo argentique : tampon de date orange incrusté sur les photos, numéros de pose, planche contact, « développer » ses photos. Tout ça dans une mise en page rangée et lisible, sans effet « carnet de scrapbooking » (pas de scotch, pas de photos de travers, pas d'écriture manuscrite).

Les **deux thèmes** portent des noms de pellicules :

| Thème | Usage | Inspiration |
|---|---|---|
| **Lomo Purple** | Clair (par défaut le jour) | Pellicule Lomography aux teintes rose-violet |
| **CineStill 800T** | Sombre (la nuit, ou au choix) | Pellicule de cinéma tungstène, néons de nuit, halos rouges |

L'app suit le réglage clair/sombre du téléphone, avec un choix manuel dans le profil.

---

## 2. Couleurs

Chaque couleur a un **rôle** (token sémantique) ; le code n'utilise jamais une valeur hexadécimale en dur.

| Token | Rôle | Lomo Purple (clair) | CineStill 800T (sombre) |
|---|---|---|---|
| `--bg` | Fond de l'app | `#EFE4E6` | `#14161B` |
| `--surface` | Cartes (posts, stats) | `#FFF9FA` | `#1E2229` |
| `--border` | Bordure des cartes | `#DCC8CD` | `#2C323C` |
| `--border-strong` | Bordure des chips, onglets | `#CDB5BC` | `#3A414D` |
| `--ink` | Texte principal, icônes | `#2B1B22` | `#EFE8DC` |
| `--ink-muted` | Texte secondaire | `#6B5560` | `#A0A7B2` |
| `--accent` | Boutons pleins, bouton Poster, badges | `#A63A5C` | `#C93C22` |
| `--on-accent` | Texte sur `--accent` | `#FFF9FA` | `#FFFFFF` |
| `--accent-text` | Accent utilisé comme texte (liens, dates d'événement) | `#9A3253` | `#FF7A5C` |
| `--stamp` | Tampon de date sur les photos, point de nav actif | `#FF8A2B` | `#FF6A3D` |
| `--chip-active-bg` / `-fg` | Chip / onglet sélectionné | `#2B1B22` / `#EFE4E6` | `#EFE8DC` / `#14161B` |
| `--reaction-1` | Pastille de la réaction principale (❤️) | `#F6DCE3` | `#3A2420` |
| `--reaction-2` | Autres pastilles de réaction | `#F3EAEC` | `#262B33` |
| `--comment-bg` | Aperçu de commentaire | `#F6EDEF` | `#262B33` |
| `--memory-bg` / `-fg` / `-label` | Carte « Il y a 1 an » | `#2B1B22` / `#EFE4E6` / `#F0A3B8` | `#3A1F1A` / `#EFE8DC` / `#FF8A5C` |
| `--nav-bg` | Barre de navigation flottante | `#2B1B22` | `#232832` |
| `--nav-icon` / `--nav-active` | Icônes de nav inactives / active | `#B9A3AC` / `#FFF9FA` | `#8B93A0` / `#FFFFFF` |
| `--film` | Fond de la planche contact | `#1E1418` | `#08090B` |
| `--sprocket` | Perforations de la pellicule | `#EFE4E6` | `#3A414D` |
| `--frame-number` | Numéros de pose | `#F0A3B8` | `#FF8A5C` |

### Règles
- **Contraste WCAG AA** vérifié : texte principal et secondaire sur fond, texte sur `--accent` (≥ 4,5:1). En sombre, l'accent des boutons (`#C93C22`) est plus foncé que l'accent utilisé en texte (`#FF7A5C`) pour tenir les deux contrastes.
- Les **avatars** utilisent des pastels fixes (sauge, sable, rose, olive…) avec un texte toujours foncé `#2A2420`, quel que soit le thème.
- **Les photos ne sont jamais filtrées.** Les filtres des maquettes servaient seulement à harmoniser les images de remplacement : dans l'app, les photos des potes s'affichent telles quelles.

---

## 3. Typographie

| Famille | Usage | Graisses |
|---|---|---|
| **Rubik** | Toute l'interface : titres et texte | 400, 500, 600, 700 |
| **Space Mono** | Métadonnées « pellicule » : dates, numéros de pose, labels en capitales | 400, 700 |

Les deux sont sur Google Fonts (licence libre), à auto-héberger dans l'app pour ne pas dépendre de Google.

### Échelle

| Style | Famille | Taille / interligne | Graisse | Exemple |
|---|---|---|---|---|
| Titre événement | Rubik | 40 / 1.05 | 700 | *Week-end Bretagne* |
| Titre profil | Rubik | 40 / 1.05 | 700 | *Léa* |
| Titre d'app | Rubik | 34 / 1.1 | 700 | *Pictur'Art* |
| Titre de carte | Rubik | 22 / 1.15 | 700 | *Week-end Bretagne* (carte souvenir) |
| Chiffre de stat | Rubik | 28 / 1.05 | 700 | *612* |
| Corps | Rubik | 15 / 1.45 | 400 | Légende d'un post |
| Nom / label | Rubik | 15 / 1.3 | 600 | *Léa* |
| Secondaire | Rubik | 13–14 / 1.4 | 400 | *9 potes · 214 poses* |
| Méta pellicule | Space Mono | 11–12, capitales, interlettrage 1,5–2 px | 400 | `12—14.07.2026 · QUIBERON` |
| Tampon photo | Space Mono | 13, interlettrage 1 px | 700 | `'26 10 11` |
| Bouton principal | Space Mono | 14, capitales, interlettrage 1 px | 700 | `DÉVELOPPER MES PHOTOS` |

---

## 4. Formes & espacements

| Élément | Rayon |
|---|---|
| Chips, pastilles de réaction, petites vignettes | 4 px |
| Onglets segmentés, planche contact, grilles photo | 6 px |
| Cartes, boutons principaux | 8 px |
| Barre de navigation flottante | 12 px |
| Avatars, bouton Poster, boutons icône | rond |

- Espacements sur une base **4 px** : 4, 8, 12, 16, 20, 24.
- Marges latérales des écrans : **16–20 px**.
- **Cibles tactiles ≥ 44 px**.
- Bordures fines (1 px) plutôt qu'ombres ; seule la nav flottante peut porter une ombre légère.

---

## 5. Iconographie

- Icônes **au trait**, épaisseur **1,8 px**, extrémités arrondies, 20–24 px.
- Bibliothèque recommandée : **Lucide** (même style que les maquettes, disponible en React).
- Le bouton **Poster** utilise un **appareil photo**, pas un simple « + ».
- Pas d'emoji dans l'interface elle-même : les emojis sont réservés aux réactions des utilisateurs.

---

## 6. Composants clés

| Composant | Description |
|---|---|
| **Barre de nav flottante** | 5 entrées : Fil, Événements, **Poster** (rond, `--accent`, au centre), Activité, Profil. L'entrée active est blanche avec un point `--stamp` dessous. |
| **Chip d'événement** | Raccourci en haut du fil, texte Space Mono capitales. Actif : `--chip-active-bg`. |
| **Carte post** | Avatar + « Léa a posté 6 photos » + méta (événement · heure) ; grille médias (1 grande + petites, « +N ») ; légende ; réactions ; aperçu du dernier commentaire. |
| **Grille médias** | 1 photo : pleine largeur. 2 : côte à côte. 3 et + : une grande à gauche, deux petites à droite, la dernière affiche « +N ». Tampon de date sur la grande. |
| **Pastille de réaction** | Emoji + compteur. Réaction perso de la bande : fond `--ink`, vignette carrée + nom (« Tom choqué 5 »). Bouton « + » en pointillés pour réagir. |
| **Carte souvenir** | Fond `--memory-bg`, vignette, label Space Mono « IL Y A 1 AN · date », titre Rubik. |
| **Onglets segmentés** | Encadré `--border-strong`, onglet actif plein. Événement : *Planche*, *Posts*, *★ Meilleures*. |
| **Planche contact** | Fond `--film`, perforations en haut et en bas, grille 3 colonnes, numéros de pose (14, 14A…), la préférée cerclée `--stamp` avec ★. Vidéos : icône lecture + durée. |
| **Bouton principal** | Pleine largeur, `--accent`, icône + texte Space Mono capitales. |
| **Pile d'avatars** | Avatars de 30 px qui se chevauchent de 8 px, bordure de la couleur du fond. |
| **Bloc stats** | Carte en 3 colonnes séparées par des filets : chiffre Rubik 700 + label Space Mono. |

---

## 7. Ton & vocabulaire

- **Tutoiement**, complice, un peu chambreur : on parle comme la bande.
- Le **vocabulaire argentique** est un clin d'œil, jamais un obstacle à la compréhension :

| Action | Libellé |
|---|---|
| Ajouter des photos à un événement | **Développer mes photos** |
| Nombre de photos | **poses** (« 214 poses ») |
| Les plus réagies | **★ Meilleures** |
| Vue d'ensemble d'un événement | **Planche** |
| Mois en cours dans l'en-tête | **ROLL 027 · OCT 2026** |

- Exemples de micro-textes : « Personne n'a encore réagi. Sois le premier. », « Ta pellicule est vide : développe tes premières photos. », bio par défaut « Photographe officiel·le des soirées (non élu·e) ».
