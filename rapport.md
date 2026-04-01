# Blind Test Live

## 1. Introduction

**Blind Test Live** est une application web de quiz musical en temps reel, pensee pour animer des parties interactives avec plusieurs roles:

- **Animateur**: cree, lance et pilote la partie.
- **Joueurs**: rejoignent via un code et buzzent depuis leur mobile.
- **Ecran public**: affiche le deroulement, le classement et le podium final.

L'objectif principal est de proposer une experience fluide, conviviale et dynamique, utilisable en soiree, en evenement ou en contexte pedagogique.

---

## 2. Objectifs de l'application

- Faciliter l'organisation de blind tests multijoueurs.
- Offrir une synchronisation en direct entre animateur, joueurs et ecran public.
- Permettre plusieurs formats de partie (playlist custom, YouTube, Spotify).
- Gerer des sessions competitives avec scores individuels ou par equipe.

---

## 3. Fonctionnalites principales

## Cote joueur

- Rejoindre une partie avec un **code**.
- Choisir un pseudo (et une equipe en mode equipe).
- Utiliser un **buzzer** en direct pendant la manche.
- Reconnexion automatique grace a un identifiant persistant.

## Cote animateur

- Connexion securisee (Google via Firebase).
- Creation et gestion de playlists personnalisees.
- Upload de medias (audio/video/image), ajout de texte, liens YouTube/Spotify.
- Lancement de parties:
  - depuis playlist locale,
  - depuis une video YouTube,
  - depuis une playlist Spotify.
- Pilotage live:
  - demarrage/reprise manche,
  - attribution de points,
  - penalites,
  - passage piste suivante,
  - fin de partie.
- Gestion des joueurs (deblocage/exclusion) et export CSV des scores.

## Ecran public

- Affichage d'un QR code et du code de partie.
- Visualisation des phases de jeu (attente, decompte, lecture, buzz, reponse, fin).
- Classement temps reel (joueurs/equipes).
- Podium final avec animations.

---

## 4. Architecture technique (vue synthese)

- **Frontend**: React + TypeScript + Vite + Tailwind CSS.
- **Backend**: Express + Socket.IO dans `server.ts`.
- **Temps reel**: communication bidirectionnelle via WebSocket.
- **Donnees**:
  - Firestore pour les playlists,
  - Firebase Storage pour les fichiers medias,
  - Auth Firebase (Google) pour l'espace animateur.
- **Execution**: logique de partie geree cote serveur, diffusion d'etat vers tous les clients.

---

## 5. Parcours type d'une partie

1. L'animateur se connecte et prepare sa source musicale.
2. Il lance une partie, ce qui genere un code unique.
3. Les joueurs rejoignent via la page d'accueil.
4. L'ecran public affiche QR code, code de partie et statut.
5. L'animateur demarre la manche (decompte puis lecture media).
6. Un joueur buzz, l'animateur valide ou penalise.
7. Les scores se mettent a jour en direct.
8. En fin de session, affichage du podium et possibilite d'exporter les scores.

---

## 6. Points forts

- **Experience live** tres reactive grace a Socket.IO.
- **Polyvalence media** (audio, video, image, texte, YouTube, Spotify).
- **Mode equipe** pour des formats collaboratifs.
- **Interface claire** separee par role (joueur / animateur / public).
- **Securisation de base** (tokens de session, sanitation, regles Firestore).

---

## 7. Limites actuelles et perspectives

## Limites actuelles

- Les parties en cours sont stockees en memoire serveur (non persistantes apres redemarrage).
- Le mode Spotify depend de credentials API (`SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`).

## Perspectives d'evolution

- Persistance des parties en base de donnees.
- Historique des matchs et statistiques avancees.
- Gestion de plusieurs animateurs/co-animateurs.
- Personnalisation visuelle des themes d'ecran public.

---

## 8. Conclusion

Blind Test Live constitue une solution complete pour organiser des quiz musicaux modernes et interactifs.  
L'application combine une interface utilisateur attractive, une synchronisation temps reel robuste et une grande flexibilite de contenu, ce qui en fait un excellent socle pour des animations ludiques a petite ou grande echelle.
