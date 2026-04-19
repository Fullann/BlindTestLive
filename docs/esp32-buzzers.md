# Intégration des buzzers ESP32 (totems)

## Objectif

Permettre à des buzzers physiques ESP32 (appelés « totems ») de jouer dans la même partie que les joueurs mobiles, chaque totem étant lié à un compte admin avec un secret unique.

## Principe d'arbitrage

- Le serveur est l'unique source de vérité.
- Premier buzz reçu côté serveur gagne.
- Les joueurs mobile et ESP32 partagent la même mécanique (`paused`, `buzzedPlayerId`).

## Architecture d'authentification des devices (V2)

Chaque totem possède un **secret unique** généré côté serveur et stocké dans la table `hardware_devices`. Ce secret est lié au compte admin propriétaire du totem.

```
Admin A → totem TOTEM-AA1 → secret aef3c... (table hardware_devices)
Admin A → totem TOTEM-AA2 → secret 9bd12... (table hardware_devices)
Admin B → totem TOTEM-BB1 → secret 7ff42... (table hardware_devices)
```

À la connexion, le serveur vérifie `(deviceId + secret)` contre la DB. Un totem ne peut se connecter qu'avec son propre secret — il est impossible d'utiliser le totem d'un autre admin.

## Provisioning USB (plug & play)

Le provisioning ne nécessite plus de modifier le firmware manuellement.

### Prérequis

- Chrome ou Edge (Web Serial API).
- Totem flashé avec `docs/firmware-esp32-provisioning.ino`.
- Totem branché en USB sur l'ordinateur du serveur ou d'un admin.

### Procédure

1. Brancher le totem en USB.
2. Ouvrir `/admin/hardware` → cliquer **Provisionner un totem**.
3. Cliquer **Connecter le totem** (sélecteur de port série natif).
4. Renseigner :
   - **Nom du totem** (ex. « Scène gauche »)
   - **SSID WiFi** et mot de passe du réseau local
   - Adresse et port du serveur (auto-remplis)
5. Cliquer **Envoyer la configuration**.

En coulisse :
- Le serveur crée une entrée `hardware_devices` et génère un secret unique de 64 caractères hexadécimaux.
- L'app envoie la config complète (SSID, host, port, deviceId, secret) au totem via le port série (JSON + `\n`).
- Le totem sauvegarde en flash NVRAM (bibliothèque `Preferences`) et redémarre.
- Dès la reconnexion au WiFi, le totem rejoint automatiquement le serveur.

### Reset de configuration

Maintenir le bouton bouton appuyé 5 secondes au démarrage → la NVRAM est effacée, le totem repasse en attente de provisioning USB.

## Configuration côté host

1. Ouvrir la page host (`/admin/game/:gameId`).
2. Dans la section **Buzzer ESP32**, le totem apparaît automatiquement une fois connecté.
3. Assigner le totem à un joueur via le champ deviceId.
4. Vérifier le statut `online/offline`.
5. Pour la gestion avancée, ouvrir `/admin/game/:gameId/hardware`.

## Séquence d'initialisation device

1. L'ESP32 lit sa config depuis la NVRAM.
2. Il se connecte au WiFi.
3. Il se connecte au namespace Socket.IO `/devices`.
4. Il envoie `device:hello` avec son `deviceId` et son `secret`.
5. Le serveur vérifie `(deviceId, secret)` dans la DB → accepte ou refuse.
6. Si accepté, le totem est visible dans toutes les pages admin.

## Séquence de buzz

1. Appui bouton → `buzzer:press`.
2. Le serveur décide accepté/refusé.
3. `ack.success === true` → LED verte + son court.
4. `ack.success === false` → LED rouge courte.

## Gestion haut-parleur

- Chaque totem peut embarquer un haut-parleur/buzzer piezo.
- Depuis la page host, l'admin peut :
  - activer/désactiver le HP,
  - mute/unmute,
  - lancer un test sonore.
- Le device reçoit ces ordres via `device:speaker`.

## Gestion avancée inventaire

Depuis `/admin/game/:gameId/hardware` :

- renommage d'un totem,
- dissociation joueur/totem,
- test LED distant (`success`, `error`, `blink`),
- test son distant,
- mute/unmute et activation/désactivation HP.

Depuis `/admin/hardware` (inventaire global) :

- liste de tous les totems enregistrés sur le compte,
- suppression d'un totem (révoque l'accès),
- accès rapide à l'inventaire par partie active.

## Recommandations hardware

- Ajouter un debounce logiciel (20-40 ms, déjà présent dans le firmware fourni).
- Heartbeat toutes les 15 secondes (configurable dans le firmware).
- Reconnexion WiFi automatique toutes les 10 s si perte réseau.

## Multi-compte sur le même serveur

Chaque admin possède sa propre flotte de totems. Les secrets étant individuels et stockés en DB liés à un `owner_id`, il est impossible pour un totem appartenant au compte A de se connecter dans une partie du compte B.

## Fallback sans DB (dev)

Si `ENABLE_DB=false`, le serveur retombe sur la variable d'environnement `DEVICE_SHARED_SECRET` comme secret global partagé (comportement V1). Ce mode est réservé au développement local sans Docker.
