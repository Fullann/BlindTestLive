# Vue d'ensemble

BlindTestLive est une application de quiz musical en temps réel avec trois rôles :

- animateur (host) : pilote la partie et arbitre les réponses,
- joueur (mobile) : rejoint avec un code de partie et buzz,
- écran public (screen) : affiche la manche et le classement.

## Fonctionnalités principales

- création et édition de playlists multimédia (audio, vidéo, image, texte, YouTube, URL),
- lancement de parties depuis une playlist ou une vidéo YouTube,
- mode équipes, jokers, pénalités et règles anti-spam,
- mode tournoi multi-manches avec cumul de score,
- onboarding joueur avant démarrage,
- analytics live et exports CSV/PDF,
- magasin de blind tests publics (store) avec likes, copies, catégories,
- support de buzzers physiques ESP32 en parallèle des joueurs mobile.

## Parcours utilisateur

1. L'admin se connecte, prépare ses playlists.
2. Il lance un blind test depuis le dashboard.
3. Les joueurs rejoignent via le code (home -> player).
4. L'écran public est ouvert via `/screen/:gameId`.
5. L'admin enchaîne les manches jusqu'à la fin et exporte les résultats.

## Persistences utilisées

- MySQL : utilisateurs, playlists, sessions de blind tests.
- Fichiers disque :
  - `uploads/` pour les médias,
  - `data/games.json` pour l'état live des parties Socket.IO.

## Extensions prévues / en place

- Appareils ESP32 : un buzzer peut être associé à un joueur.
- Le serveur arbitre de façon unique les buzz physiques et mobiles.
