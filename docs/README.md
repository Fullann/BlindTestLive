# BlindTestLive - Documentation

Ce dossier centralise la documentation technique et produit de l'application.

## Index

- `docs/overview.md` : vision globale, fonctionnalités, parcours utilisateur.
- `docs/architecture.md` : architecture frontend/backend/socket, flux runtime.
- `docs/data-model.md` : modèle de données MySQL et état des parties live.
- `docs/api-rest.md` : endpoints REST (`/api/auth`, `/api/playlists`, `/api/blindtests`, `/api/hardware`).
- `docs/socket-events.md` : contrat temps réel Socket.IO (host, player, screen, devices).
- `docs/esp32-buzzers.md` : intégration des totems ESP32 — provisioning USB, secrets individuels, fairness.
- `docs/hardware-assembly.md` : tutoriel montage physique des buzzers.
- `docs/firmware-esp32.ino` : firmware Arduino minimal (Wi-Fi + WebSocket + LED + bouton).
- `docs/firmware-esp32-provisioning.ino` : firmware complet avec provisioning USB, NVRAM et haut-parleur.
- `docs/frontend.md` : pages React, état client, thèmes, comportements clés.
- `docs/deployment.md` : configuration `.env`, Docker, exécution locale et prod.
- `docs/security.md` : sécurité applicative, menaces couvertes et recommandations.

## Stack

- Frontend : React + Vite + TypeScript + Tailwind.
- Backend : Node.js + Express + Socket.IO + TypeScript.
- Base de données : MySQL.
- Auth : JWT + cookies HTTP + 2FA TOTP.
- Médias : fichiers locaux dans `uploads/`.

## Convention des docs

- Les exemples sont orientés environnement local (`localhost:5174`).
- Les payloads JSON sont volontairement minimaux.
- Les points de sécurité critiques sont repris dans `docs/security.md`.
