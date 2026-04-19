# Déploiement et exécution

## Variables d'environnement

Voir `.env.example`.

Variables clés :

- `PORT` : port serveur Node.
- `ENABLE_DB` : active les routes MySQL.
- `DB_*` : connexion MySQL.
- `JWT_SECRET` : secret JWT long et aléatoire.
- `ALLOWED_ORIGINS` : origines frontend autorisées.
- `DEVICE_SHARED_SECRET` : secret namespace `/devices`.

## Local (sans Docker app)

1. lancer MySQL local (ou Docker DB seule),
2. configurer `.env`,
3. `npm install`,
4. `npm run dev`.

## Docker

Fichiers :

- `Dockerfile`
- `docker-compose.yml`
- `docker-compose.test.yml`

Usage courant :

- DB seulement : `docker compose up -d mysql`
- stack complète : `docker compose --profile app up -d`

## Build prod

- `npm run build`
- `NODE_ENV=production npm start` (selon scripts du projet)

## Uploads et persistance

- médias dans `uploads/` (volume conseillé en prod),
- état live dans `data/games.json` (volume conseillé en prod).

## Check rapide post-déploiement

- `GET /api/health`
- connexion admin + création partie
- join joueur + buzz
- ouverture écran public
- test upload média
