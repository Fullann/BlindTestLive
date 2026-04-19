# Architecture technique

## Schéma global

- `src/` : frontend React (SPA).
- `server.ts` : bootstrap Express + Socket.IO + middleware.
- `server/routes/` : API REST.
- `server/socket/` : handlers temps réel par domaine.
- `server/db.ts` : pool MySQL.
- `db/init.sql` : schéma initial.

## Flux principal runtime

1. Le navigateur charge la SPA (Vite en dev, `dist/` en prod).
2. Le frontend appelle l'API REST pour auth/playlists/blindtests.
3. Le frontend se connecte à Socket.IO pour les événements de jeu.
4. L'état live d'une partie est conservé en mémoire puis persisté dans `data/games.json`.
5. Les médias uploadés sont servis depuis `/uploads`.

## Serveur HTTP

- Framework : Express.
- Middlewares : `helmet`, `rate-limit`, `cookie-parser`, `express.json`.
- CORS/Origins contrôlés via `ALLOWED_ORIGINS`.
- Monitoring : endpoint `/api/metrics`.

## Couche temps réel

### Namespace principal `/`

Handlers :

- `host.ts` : création/contrôle de partie.
- `player.ts` : join joueur + buzz + anti-spam.
- `screen.ts` : écran public.
- `game-state.ts` : check/requête d'état.

### Namespace matériel `/devices`

Handler :

- `devices.ts` : handshake matériel, heartbeat, buzz physiques.

Rôle :

- connecter les ESP32 sans impacter les sockets web classiques,
- conserver un état de présence des buzzers (`online/offline`),
- injecter les appuis physiques dans la même logique de buzz.

## État d'une partie (`ServerGameState`)

Un état de partie contient :

- configuration de jeu (difficulté, règles, mode équipe),
- playlist, index courant, statut (lobby/playing/finished...),
- joueurs et scores,
- logs d'événements,
- mapping `hardwareDevices` (si buzzers physiques).

## Résilience

- persistance périodique de l'état des parties dans `data/games.json`,
- expiration automatique des parties inactives,
- validations strictes (`zod`) pour les payloads sockets.
