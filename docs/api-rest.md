# API REST

Base URL locale : `http://localhost:5174`

Toutes les routes API sont préfixées par `/api`.

## Auth (`/api/auth`)

- `POST /register` : création de compte.
- `POST /login` : login email/mot de passe.
- `POST /login/2fa` : validation TOTP.
- `GET /me` : profil courant (cookie JWT requis).
- `POST /logout` : invalidation session côté client.
- `POST /2fa/setup` : génération secret + QR code.
- `POST /2fa/enable` : activer 2FA.
- `POST /2fa/disable` : désactiver 2FA.
- `POST /password/change` : changer mot de passe.

## Playlists (`/api/playlists`)

- `GET /` : playlists de l'utilisateur connecté.
- `GET /public` : playlists publiques des autres.
- `GET /:id` : playlist par id.
- `POST /` : créer playlist.
- `PUT /:id` : modifier playlist.
- `DELETE /:id` : supprimer playlist.
- `POST /:playlistId/upload` : upload d'un média.

## Store (`/api/playlists/store`)

- `GET /store?sort=popular|recent&category=...`
  - retourne les playlists publiques enrichies.
- `GET /store/likes`
  - liste des IDs likés par l'utilisateur.
- `POST /:id/store/like`
  - toggle like.
- `POST /:id/store/download`
  - incrémente le compteur de copies.

## Blind tests (`/api/blindtests`)

- `GET /` : liste des sessions admin.
- `POST /` : créer une session.
- `PATCH /:id` : mise à jour statut/session.
- `POST /:id/force-end` : forcer la fin d'une session.

## Hardware / totems ESP32 (`/api/hardware`)

Toutes ces routes nécessitent un cookie JWT valide (admin connecté).

### `GET /provision-config`

Retourne l'adresse et le port du serveur pour pré-remplir le formulaire de provisioning.

```json
{ "serverHost": "192.168.1.10", "serverPort": 5174 }
```

### `POST /devices`

Enregistre (ou re-claim) un totem pour le compte admin connecté.

Corps : `{ "deviceId": "TOTEM-AB3X7", "name": "Scène gauche" }`

- Si le `deviceId` n'existe pas → crée une entrée avec un **secret unique** de 64 caractères hexadécimaux.
- Si le `deviceId` appartient déjà au même admin → retourne le secret existant (idempotent).
- Si le `deviceId` appartient à un autre admin → `409 Conflict`.

Réponse :

```json
{
  "success": true,
  "deviceId": "TOTEM-AB3X7",
  "secret": "aef3c9...64chars",
  "isNew": true
}
```

> Le secret n'est retourné qu'à ce moment. Il est ensuite transmis au totem via USB (Web Serial). Il n'est plus exposé par l'API par la suite.

### `GET /devices`

Liste les totems enregistrés sur le compte (sans exposer les secrets).

```json
{
  "devices": [
    { "deviceId": "TOTEM-AB3X7", "name": "Scène gauche", "firmware": "1.3.0", "createdAt": 1712000000000 }
  ]
}
```

### `DELETE /devices/:deviceId`

Supprime un totem du compte. Le totem ne pourra plus se connecter au serveur (son secret est révoqué).

## Réponses d'erreur usuelles

- `400` : payload invalide.
- `401` : non authentifié.
- `403` : non autorisé.
- `404` : ressource introuvable.
- `500` : erreur interne.
