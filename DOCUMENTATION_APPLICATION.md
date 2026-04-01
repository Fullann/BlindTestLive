# Documentation complete de l'application

## Vue d'ensemble

Cette application est un **Blind Test Live** multi-joueurs en temps reel avec:

- un espace **joueur** (buzzer sur mobile),
- un espace **animateur** (pilotage de partie),
- un **ecran public** (affichage TV/projection),
- un backend temps reel via **Socket.IO**,
- une persistance des playlists via **Firebase Firestore/Storage**.

Stack principale:

- Frontend: `React 19` + `Vite` + `TypeScript` + `React Router`
- Temps reel: `socket.io` / `socket.io-client`
- Backend: `Express` + serveur Vite middleware (`server.ts`)
- Data: `Firebase Auth`, `Firestore`, `Storage`
- UI: `Tailwind CSS`, `lucide-react`, `framer-motion`

---

## Structure du projet

- `src/main.tsx`: point d'entree React.
- `src/App.tsx`: routing principal.
- `src/pages/`
  - `Home.tsx`: accueil, connexion joueur, acces animateur, acces ecran public.
  - `AdminDashboard.tsx`: gestion playlists + lancement parties.
  - `EditPlaylist.tsx`: edition d'une playlist (tracks, media, upload).
  - `HostGame.tsx`: console de l'animateur en direct.
  - `PlayerGame.tsx`: interface joueur avec buzzer.
  - `PublicScreen.tsx`: affichage public de la partie et classement.
- `src/types.ts`: modeles de donnees (GameState, Player, Track, Playlist).
- `src/firebase.ts`: initialisation Firebase (Auth/Firestore/Storage).
- `src/lib/socket.ts`: client Socket.IO.
- `src/lib/firebase-errors.ts`: normalisation des erreurs Firestore.
- `src/components/ErrorBoundary.tsx`: capture erreurs React.
- `server.ts`: backend Node (Socket.IO + logique de jeu + API healthcheck).
- `firestore.rules`: securite Firestore pour les playlists.

---

## Navigation et routes

Routes definies dans `src/App.tsx`:

- `/` -> Accueil (`Home`)
- `/admin` -> Dashboard animateur (`AdminDashboard`)
- `/admin/playlist/:playlistId` -> Edition playlist (`EditPlaylist`)
- `/admin/game/:gameId` -> Interface animateur live (`HostGame`)
- `/game/:gameId` -> Interface joueur (`PlayerGame`)
- `/screen/:gameId` -> Ecran public (`PublicScreen`)

---

## Fonctionnalites par ecran

## 1) Accueil (`Home`)

- Saisie du code de partie (6 caracteres).
- Verification d'existence de partie via `game:check`.
- Inscription joueur avec:
  - pseudo,
  - equipe optionnelle (mode equipe),
  - identifiant persistant (`blindtest_player_id`) + secret de reconnexion.
- Redirection vers `/game/:gameId` apres succes.
- Connexion animateur via Google (`Firebase Auth`) vers `/admin`.
- Ouverture de l'ecran public via code (`/screen/:gameId`).

## 2) Dashboard animateur (`AdminDashboard`)

- Recuperation des playlists du compte courant (Firestore).
- Creation/suppression de playlists.
- Lancement de partie:
  - depuis playlist locale (tracks custom),
  - depuis URL YouTube (mode video),
  - depuis URL playlist Spotify.
- Option **Mode equipe** avant lancement.
- Stockage local du `hostToken` pour autoriser la re-connexion animateur.

## 3) Edition playlist (`EditPlaylist`)

- Modification du nom de playlist.
- Ajout/suppression de pistes.
- Champs par piste:
  - titre, artiste,
  - type media (`audio`, `video`, `image`, `text`, `youtube`, `spotify`),
  - source (`mediaUrl` / `url`) ou texte,
  - `startTime` et `duration`.
- Upload de fichiers (audio/video/image) vers Firebase Storage.
- Sauvegarde en Firestore (`name`, `tracks`).

## 4) Console animateur live (`HostGame`)

- Rejoint la partie avec `hostToken`.
- Controle du jeu:
  - lancement manche / reprise,
  - reveal reponse,
  - piste suivante,
  - fin de partie.
- Gestion buzz:
  - joueur buzzed visible en direct,
  - bonne reponse (attribution points),
  - mauvaise reponse (lock joueur, reprise).
- Gestion joueurs:
  - score individuel ou equipe,
  - debloquer joueur,
  - exclure joueur.
- Outils:
  - ouvrir/copie lien ecran public,
  - export CSV des scores en fin de partie.
- Integrations media:
  - YouTube embed (mode video globale),
  - Spotify Embed Iframe API (morceaux Spotify).

## 5) Ecran joueur (`PlayerGame`)

- Reconnexion automatique via `playerId` + `playerSecret` en localStorage.
- Affichage:
  - statut partie (lobby, countdown, playing, paused, revealed, finished),
  - score perso (ou score d'equipe en mode equipe),
  - gros bouton BUZZ.
- Restrictions:
  - buzz actif uniquement en `playing`,
  - joueur bloque si penalise.
- Effets: sons feedback (buzz/correct/wrong), animations.

## 6) Ecran public (`PublicScreen`)

- QR code pour rejoindre (page d'accueil) + code partie.
- Affichage dynamique:
  - lobby (attente),
  - countdown geant,
  - lecture media (audio/video/image/text/youtube),
  - overlay buzzed player,
  - reveal reponse,
  - podium final + confettis.
- Classement en direct:
  - par joueur,
  - ou par equipe.

---

## Mode de jeu et statut

Etat de partie (`GameStatus`):

- `lobby`: attente joueurs
- `countdown`: decompte 3..2..1
- `playing`: manche active, buzz autorise
- `paused`: buzz capture, en attente decision animateur
- `revealed`: reponse affichee
- `finished`: partie terminee

Modes supportes:

- **Playlist custom** (media varies)
- **YouTube mode** (video continue, manches successives)
- **Spotify mode** (playlist recuperee via API Spotify)
- **Team mode** (scores agreges par equipe)

---

## Modele de donnees principal

`Track`:

- id, title, artist
- mediaType, mediaUrl, textContent
- duration, startTime
- url (legacy/alternative)

`Player`:

- id persistant, socketId courant
- name, color, score
- lockedOut
- team (optionnel)
- playerSecret (reconnexion securisee)

`GameState`:

- id (code partie), adminId, hostToken
- status
- players (map)
- playlist + currentTrackIndex
- buzzedPlayerId + buzzTimestamp
- trackStartTime / countdown
- youtubeVideoId / isSpotifyMode / isTeamMode
- roundNumber (YouTube)
- lastActivity (cleanup serveur)

`Playlist`:

- id, name, ownerId
- tracks[]
- createdAt

---

## Architecture temps reel (Socket.IO)

Principaux evenements emits/captures:

- Host creation:
  - `host:createGame`
  - `host:createYoutubeGame`
  - `host:createSpotifyGame`
- Rejoindre:
  - `game:check`
  - `player:joinGame`
  - `screen:joinGame`
  - `host:joinGame`
- Gameplay:
  - `host:startTrack`
  - `player:buzz`
  - `host:awardPoints`
  - `host:penalize`
  - `host:unlockPlayer`
  - `host:revealAnswer`
  - `host:nextTrack`
  - `host:resumeYoutube`
  - `host:endGame`
  - `host:kickPlayer`
- Broadcast:
  - `game:stateUpdate`
  - `game:playSound`
  - `player:kicked`

Le serveur sanitise les donnees envoyees aux clients:

- retrait de `hostToken`,
- retrait de `playerSecret`.

---

## Backend (`server.ts`)

Comportements majeurs:

- Stockage des parties en memoire (`activeGames`).
- Limites anti-abus:
  - max parties globales,
  - cooldown creation partie par socket,
  - rate limit buzz (500 ms).
- Validation/sanitation des entrees:
  - taille playlist max 200,
  - longueurs de champs track bornees,
  - validation ID YouTube/Spotify.
- Spotify:
  - token OAuth client credentials,
  - lecture de playlist API,
  - mapping en `Track[]` puis shuffle.
- Cycle de vie:
  - cleanup des parties inactives (>2h),
  - countdown serveur synchronise,
  - mise a jour et diffusion etat en direct.
- Endpoint REST:
  - `GET /api/health` -> `{ status: "ok" }`

---

## Firebase (auth, donnees, fichiers)

## Auth

- Connexion Google pour l'animateur.

## Firestore

- Collection `playlists`.
- Un utilisateur lit/ecrit uniquement ses playlists (`ownerId`).
- Validation schema via `firestore.rules`.


## Storage

- Upload des medias de playlist (audio/video/image).
- URL de telechargement stockee dans les tracks.

---

## Securite et robustesse

Points de securite deja presents:

- Verification `hostToken` pour l'animateur.
- Verification `playerSecret` pour reconnexion joueur.
- Sanitation des champs texte recu cote serveur.
- Suppression des secrets dans l'etat diffuse.
- Firestore rules strictes sur owner + shape playlist.
- Nettoyage automatique des parties inactives.

Points a surveiller (operatoire):

- Les parties et scores sont en memoire serveur (non persistants en cas de redemarrage).
- Le mode Spotify depend des variables env `SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET`.

---

## Scripts npm

Depuis `package.json`:

- `npm run dev`: lance `tsx server.ts`
- `npm run build`: build frontend Vite
- `npm run preview`: preview build
- `npm run clean`: suppression `dist`
- `npm run lint`: verif TypeScript (`tsc --noEmit`)
- `npm run start`: demarre `server.ts` via Node

---

## Variables et prerequis

Prerequis:

- Node.js
- Projet Firebase configure

Variables d'environnement utiles:

- `SPOTIFY_CLIENT_ID`
- `SPOTIFY_CLIENT_SECRET`

---

## Resume fonctionnel

L'application permet d'organiser un blind test multi-joueurs complet:

- creation de playlists multimedia,
- animation en direct avec buzz, points, penalites, equipes,
- diffusion grand ecran avec QR code et podium,
- synchronisation temps reel sur tous les clients.
