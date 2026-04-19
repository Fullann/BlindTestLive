# Frontend React

## Entrée application

- `src/main.tsx` : bootstrap React.
- `src/App.tsx` : routes principales + providers (`AuthProvider`, `ThemeProvider`).

## Pages

- `Home.tsx` : accueil, join game, auto-reconnexion joueur, accès store.
- `AdminDashboard.tsx` : gestion playlists, lancement quiz, blind tests actifs/terminés.
- `AdminSettings.tsx` : compte, 2FA, changement mot de passe.
- `EditPlaylist.tsx` : édition fine des pistes média.
- `HostGame.tsx` : pilotage temps réel de la partie.
- `HardwareDashboard.tsx` : inventaire matériel (ESP32) pour une partie donnée.
- `HardwareInventory.tsx` : hub matériel global — liste des totems enregistrés, accès rapide aux inventaires par partie.
- `HardwareTutorial.tsx` : tutoriel de montage physique des buzzers.
- `HardwareProvision.tsx` : provisioning USB plug & play via Web Serial API.
- `PlayerGame.tsx` : interface joueur (buzz, jokers, fin de partie).
- `PublicScreen.tsx` : affichage public.
- `BlindTestStore.tsx` : navigation des blind tests publics.

## État côté client

- Auth : `src/context/AuthContext.tsx`.
- Theme : `src/context/ThemeContext.tsx`.
- Socket global : `src/lib/socket.ts`.

## API client

Le client HTTP est centralisé dans `src/api.ts`.

Points clés :

- `credentials: include` pour cookie JWT,
- gestion d'erreur unifiée,
- sections `auth`, `playlists`, `blindtests`, `hardware`.

## Design system léger

- classes globales dans `src/index.css` :
  - `app-shell`,
  - `app-card`,
  - `app-input`.
- support thème clair/sombre via `ThemeContext`.

## Host + matériel

La page host inclut une section **Buzzer ESP32** :

- assignation d'un `deviceId` à un joueur,
- affichage statut `online/offline`,
- dernier heartbeat et RSSI si disponible.

Pour aller plus loin, l'écran **Inventaire matériel par partie** (`/admin/game/:gameId/hardware`) permet :

- renommage des devices,
- dissociation joueur/device,
- test LED/son,
- pilotage haut-parleur (actif, mute).

## Provisioning USB

La page `/admin/hardware/provision` (`HardwareProvision.tsx`) utilise la **Web Serial API** (Chrome/Edge uniquement) pour configurer un totem en quelques secondes :

1. Connexion au port série du totem branché en USB.
2. Saisie du nom, SSID WiFi et mot de passe.
3. Clic sur « Envoyer » → le serveur génère un secret unique, l'app l'envoie au totem via série.
4. Le totem redémarre et se connecte automatiquement.

La page affiche en temps réel la sortie série du totem (logs de boot, statut WiFi, confirmation de sauvegarde NVRAM) ainsi qu'un journal des actions effectuées.
