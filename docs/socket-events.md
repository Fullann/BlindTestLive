# Contrat Socket.IO

## Namespace principal `/`

## Host

- `host:createGame(playlist, options, ack)`
- `host:createYoutubeGame(youtubeId, options, ack)`
- `host:joinGame({ gameId, hostToken }, ack)`
- `host:startTrack({ gameId, hostToken }, ack)`
- `host:awardPoints({ gameId, playerId, points, hostToken }, ack)`
- `host:penalize({ gameId, playerId, hostToken }, ack)`
- `host:unlockPlayer({ gameId, playerId, hostToken }, ack)`
- `host:endGame({ gameId, hostToken }, ack)`
- `host:kickPlayer({ gameId, playerId, hostToken }, ack)`
- `host:revealAnswer({ gameId, hostToken }, ack)`
- `host:nextTrack({ gameId, hostToken }, ack)`
- `host:reorderTrack({ gameId, hostToken, fromIndex, toIndex }, ack)`
- `host:assignPlayerTeam({ gameId, hostToken, playerId, teamId }, ack)`
- `host:appendRoundTracks({ gameId, hostToken, name, tracks }, ack)`
- `host:assignDevice({ gameId, hostToken, playerId, deviceId }, ack)`
- `host:setDeviceSpeaker({ gameId, hostToken, deviceId, speakerEnabled?, speakerMuted? }, ack)`
- `host:testDeviceSpeaker({ gameId, hostToken, deviceId, pattern? }, ack)`
- `host:renameDevice({ gameId, hostToken, deviceId, name }, ack)`
- `host:unassignDevice({ gameId, hostToken, playerId }, ack)`
- `host:testDeviceLed({ gameId, hostToken, deviceId, pattern? }, ack)`

## Player

- `player:joinGame({ gameId, playerId?, playerSecret?, name, team? }, ack)`
- `player:buzz({ gameId, playerId }, ack)`
- `player:useJoker({ gameId, playerId, jokerType, targetPlayerId? }, ack)`

## Screen

- `screen:joinGame(gameId, ack)`

## Game state

- `game:check(gameId, ack)`
- `game:requestState({ gameId, hostToken? }, ack)`

## Événements émis par le serveur

- `game:stateUpdate(state)`
- `game:eventLogs(logs)`
- `game:playSound(type)`
- `game:hardwareUpdate(hardwareDevices)`
- `player:kicked`
- `player:forceLogout`
- `server:error(message)`

## Namespace matériel `/devices`

## Device -> serveur

- `device:hello({ deviceId, secret, name?, firmware? }, ack)`
- `device:heartbeat({ deviceId, rssi? })`
- `buzzer:press({ deviceId, gameId, pressedAt? }, ack)`

## Serveur -> device

- via `ack` de `buzzer:press` :
  - `{ success: true }` : buzz accepté
  - `{ success: false, error }` : buzz refusé
- `device:speaker({ deviceId, command, speakerEnabled?, speakerMuted?, pattern? })`
  - `command: "sync"` -> appliquer état local HP
  - `command: "test"` -> jouer un bip de test
- `device:led({ deviceId, command, pattern? })`
  - `command: "test"` -> test visuel LED (`success`, `error`, `blink`)

Note : le device peut aussi écouter `game:stateUpdate` si nécessaire (optionnel côté firmware V1).

## Exemples JSON

```json
{
  "deviceId": "bt-buzzer-01",
  "secret": "change_me_for_esp32",
  "name": "Buzzer Rouge",
  "firmware": "1.0.0"
}
```

```json
{
  "gameId": "AB12CD",
  "hostToken": "uuid-host-token",
  "playerId": "player-uuid",
  "deviceId": "bt-buzzer-01"
}
```

```json
{
  "deviceId": "bt-buzzer-01",
  "gameId": "AB12CD",
  "pressedAt": 1712345678901
}
```
