# Sécurité

## Mécanismes en place

- headers de sécurité via `helmet`,
- rate limiting API (`/api/*`),
- contrôle des origines autorisées,
- validation stricte des payloads sockets (`zod`),
- auth JWT via cookie + 2FA TOTP,
- contrôles de permissions host/cohost.

## Risques couverts

- spam d'API / brute-force léger,
- événements socket malformés,
- hijack simple de session joueur (secret de reconnexion),
- abus d'actions host par cohost non autorisé.

## Authentification des totems ESP32 (V2)

Les totems utilisent désormais un **secret individuel** par appareil, stocké en base de données et lié au compte admin propriétaire :

- généré cryptographiquement (`crypto.randomBytes(32)` → 64 hex chars),
- jamais ré-exposé après le provisioning initial,
- révocable instantanément (suppression de l'entrée `hardware_devices`).

La vérification s'effectue à chaque `device:hello` via une requête SQL `(device_id, secret)` → si la paire est inconnue ou appartient à un autre compte, la connexion est rejetée.

**Fallback dev** : si `ENABLE_DB=false`, le serveur retombe sur `DEVICE_SHARED_SECRET` (secret global partagé, réservé au développement local).

## Points d'attention

- Persistance `data/games.json` non chiffrée.
- Uploads locaux : vérifier quotas disque et type MIME.
- Le secret d'un totem transite en clair sur le port série USB au moment du provisioning — ce canal est local et physique, donc acceptable ; ne pas exposer ce flux sur un réseau.

## Recommandations court terme

- Rotation régulière de `JWT_SECRET`,
- HTTPS obligatoire en production (le secret device transite dans le WebSocket),
- Sauvegardes MySQL + uploads + data.

## Recommandations moyen terme

- Signature HMAC des messages device critiques (anti-replay),
- Audit trail admin détaillé (assignation device, buzz rejetés, provisioning),
- OTA signée pour mise à jour firmware des totems à distance.
