# Modèle de données

## Base MySQL

## `users`

- `id` : identifiant utilisateur.
- `email` : unique.
- `password_hash` : hash bcrypt.
- `two_factor_enabled` : booléen.
- `two_factor_secret` : secret TOTP.
- `created_at` : timestamp.

## `playlists`

- `id`, `name`, `owner_id`.
- `tracks` : JSON sérialisé.
- `visibility` : `private` / `public`.
- `category` : catégorie store.
- `likes_count` : compteur de likes.
- `downloads_count` : compteur de copies.
- `created_at`.

## `playlist_likes`

- `playlist_id`, `user_id` (clé composite),
- `created_at`.

## `blindtests`

- session de partie persistée côté métier (historique).
- statut : actif / terminé.

## `hardware_devices`

Inventaire des totems ESP32 par compte admin.

| Colonne | Type | Description |
|---|---|---|
| `device_id` | `VARCHAR(64) PK` | Identifiant unique du totem (ex. `TOTEM-AB3X7`) |
| `owner_id` | `VARCHAR(36)` | FK vers `users.id` |
| `secret` | `VARCHAR(128)` | Secret hexadécimal de 64 chars, généré à l'enregistrement |
| `name` | `VARCHAR(64)` | Nom lisible (ex. « Scène gauche ») |
| `firmware` | `VARCHAR(32)` | Dernière version firmware rapportée par le device |
| `created_at` | `BIGINT` | Timestamp UNIX ms |

Index : `idx_hw_owner (owner_id)`.

Le secret est vérifié à chaque connexion Socket.IO du totem (`device:hello`). Un totem ne peut appartenir qu'à un seul compte admin. La suppression d'un enregistrement révoque immédiatement l'accès du totem.

## État live des parties

Les parties temps réel sont stockées dans `data/games.json` avec :

- joueurs connectés et scores,
- statut courant de manche,
- historique d'events,
- tokens d'host/cohost temporaires,
- état des appareils matériels (`hardwareDevices`).

## Représentation des joueurs

Chaque joueur contient :

- identité (`id`, `name`, `socketId`),
- score, lockout, stats,
- équipe éventuelle,
- `deviceType` (`mobile` ou `esp32`),
- `buzzerDeviceId` optionnel.

## Représentation des buzzers ESP32

`hardwareDevices[deviceId]` contient :

- `status` (`online` / `offline`),
- `playerId` assigné,
- `lastSeenAt`,
- infos diagnostics (`firmware`, `rssi`).
