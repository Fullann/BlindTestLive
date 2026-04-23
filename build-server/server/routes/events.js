"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const uuid_1 = require("uuid");
const db_js_1 = __importDefault(require("../db.js"));
const auth_js_1 = require("../middleware/auth.js");
const router = (0, express_1.Router)();
let schemaChecked = false;
async function ensureSchema() {
    if (schemaChecked)
        return;
    await db_js_1.default.query(`CREATE TABLE IF NOT EXISTS tournaments (
      id VARCHAR(36) NOT NULL PRIMARY KEY,
      owner_id VARCHAR(36) NOT NULL,
      name VARCHAR(255) NOT NULL,
      starts_at BIGINT NULL,
      ends_at BIGINT NULL,
      created_at BIGINT NOT NULL,
      INDEX idx_tournaments_owner (owner_id)
    )`);
    await db_js_1.default.query(`CREATE TABLE IF NOT EXISTS tournament_sessions (
      tournament_id VARCHAR(36) NOT NULL,
      blindtest_id VARCHAR(36) NOT NULL,
      created_at BIGINT NOT NULL,
      PRIMARY KEY (tournament_id, blindtest_id),
      INDEX idx_tournament_sessions_bt (blindtest_id)
    )`);
    await db_js_1.default.query(`CREATE TABLE IF NOT EXISTS event_branding (
      blindtest_id VARCHAR(36) NOT NULL PRIMARY KEY,
      owner_id VARCHAR(36) NOT NULL,
      client_name VARCHAR(255) NOT NULL DEFAULT '',
      logo_url TEXT NULL,
      primary_color VARCHAR(16) NOT NULL DEFAULT '#6366f1',
      accent_color VARCHAR(16) NOT NULL DEFAULT '#a855f7',
      created_at BIGINT NOT NULL,
      updated_at BIGINT NOT NULL,
      INDEX idx_event_branding_owner (owner_id)
    )`);
    schemaChecked = true;
}
function readGames() {
    try {
        const gamesFile = path_1.default.resolve(process.cwd(), 'data', 'games.json');
        if (!fs_1.default.existsSync(gamesFile))
            return {};
        const raw = fs_1.default.readFileSync(gamesFile, 'utf-8');
        return raw ? JSON.parse(raw) : {};
    }
    catch {
        return {};
    }
}
router.get('/branding/by-game/:gameId', async (req, res) => {
    try {
        await ensureSchema();
        const [rows] = await db_js_1.default.query(`SELECT eb.client_name, eb.logo_url, eb.primary_color, eb.accent_color
       FROM blindtests bt
       INNER JOIN event_branding eb ON eb.blindtest_id = bt.id
       WHERE bt.game_id = ?
       ORDER BY bt.created_at DESC
       LIMIT 1`, [req.params.gameId]);
        const branding = rows[0];
        return res.json({ branding: branding || null });
    }
    catch (error) {
        console.error('events branding by-game error', error);
        return res.status(500).json({ error: 'Erreur serveur' });
    }
});
router.use(auth_js_1.requireAuth);
router.get('/tournaments', async (req, res) => {
    try {
        await ensureSchema();
        const [rows] = await db_js_1.default.query('SELECT * FROM tournaments WHERE owner_id = ? ORDER BY created_at DESC', [req.user.userId]);
        return res.json({ tournaments: rows });
    }
    catch (error) {
        console.error('events tournaments list error', error);
        return res.status(500).json({ error: 'Erreur serveur' });
    }
});
router.post('/tournaments', async (req, res) => {
    try {
        await ensureSchema();
        const { name, startsAt, endsAt } = req.body;
        if (!name?.trim())
            return res.status(400).json({ error: 'Nom de tournoi requis' });
        const id = (0, uuid_1.v4)();
        const now = Date.now();
        await db_js_1.default.query('INSERT INTO tournaments (id, owner_id, name, starts_at, ends_at, created_at) VALUES (?, ?, ?, ?, ?, ?)', [id, req.user.userId, name.trim().slice(0, 255), startsAt || null, endsAt || null, now]);
        return res.status(201).json({
            tournament: { id, owner_id: req.user.userId, name: name.trim().slice(0, 255), starts_at: startsAt || null, ends_at: endsAt || null, created_at: now },
        });
    }
    catch (error) {
        console.error('events tournament create error', error);
        return res.status(500).json({ error: 'Erreur serveur' });
    }
});
router.post('/tournaments/:id/sessions', async (req, res) => {
    try {
        await ensureSchema();
        const { blindtestId } = req.body;
        if (!blindtestId)
            return res.status(400).json({ error: 'blindtestId requis' });
        const [tRows] = await db_js_1.default.query('SELECT id, owner_id FROM tournaments WHERE id = ?', [req.params.id]);
        const tournament = tRows[0];
        if (!tournament)
            return res.status(404).json({ error: 'Tournoi introuvable' });
        if (tournament.owner_id !== req.user.userId)
            return res.status(403).json({ error: 'Accès refusé' });
        const [bRows] = await db_js_1.default.query('SELECT id, owner_id FROM blindtests WHERE id = ?', [blindtestId]);
        const blindtest = bRows[0];
        if (!blindtest)
            return res.status(404).json({ error: 'Session introuvable' });
        if (blindtest.owner_id !== req.user.userId)
            return res.status(403).json({ error: 'Accès refusé' });
        await db_js_1.default.query('INSERT INTO tournament_sessions (tournament_id, blindtest_id, created_at) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE created_at = created_at', [req.params.id, blindtestId, Date.now()]);
        return res.json({ success: true });
    }
    catch (error) {
        console.error('events tournament attach session error', error);
        return res.status(500).json({ error: 'Erreur serveur' });
    }
});
router.get('/tournaments/:id/leaderboard', async (req, res) => {
    try {
        await ensureSchema();
        const [tRows] = await db_js_1.default.query('SELECT id, owner_id, name FROM tournaments WHERE id = ?', [req.params.id]);
        const tournament = tRows[0];
        if (!tournament)
            return res.status(404).json({ error: 'Tournoi introuvable' });
        if (tournament.owner_id !== req.user.userId)
            return res.status(403).json({ error: 'Accès refusé' });
        const [rows] = await db_js_1.default.query(`SELECT bt.id, bt.title, bt.game_id, bt.created_at
       FROM tournament_sessions ts
       INNER JOIN blindtests bt ON bt.id = ts.blindtest_id
       WHERE ts.tournament_id = ?
       ORDER BY bt.created_at ASC`, [req.params.id]);
        const sessions = rows;
        const games = readGames();
        const playersByName = {};
        for (const session of sessions) {
            const game = games[session.game_id];
            if (!game?.players)
                continue;
            for (const player of Object.values(game.players)) {
                const name = String(player?.name || 'Joueur');
                if (!playersByName[name])
                    playersByName[name] = { name, score: 0, sessions: 0 };
                playersByName[name].score += Number(player?.score || 0);
                playersByName[name].sessions += 1;
            }
        }
        const leaderboard = Object.values(playersByName).sort((a, b) => b.score - a.score).slice(0, 50);
        return res.json({ tournament, sessions, leaderboard });
    }
    catch (error) {
        console.error('events tournament leaderboard error', error);
        return res.status(500).json({ error: 'Erreur serveur' });
    }
});
router.get('/branding/:blindtestId', async (req, res) => {
    try {
        await ensureSchema();
        const [bRows] = await db_js_1.default.query('SELECT id, owner_id FROM blindtests WHERE id = ?', [req.params.blindtestId]);
        const blindtest = bRows[0];
        if (!blindtest)
            return res.status(404).json({ error: 'Session introuvable' });
        if (blindtest.owner_id !== req.user.userId)
            return res.status(403).json({ error: 'Accès refusé' });
        const [rows] = await db_js_1.default.query('SELECT client_name, logo_url, primary_color, accent_color FROM event_branding WHERE blindtest_id = ?', [req.params.blindtestId]);
        return res.json({ branding: rows[0] || null });
    }
    catch (error) {
        console.error('events branding get error', error);
        return res.status(500).json({ error: 'Erreur serveur' });
    }
});
router.put('/branding/:blindtestId', async (req, res) => {
    try {
        await ensureSchema();
        const [bRows] = await db_js_1.default.query('SELECT id, owner_id FROM blindtests WHERE id = ?', [req.params.blindtestId]);
        const blindtest = bRows[0];
        if (!blindtest)
            return res.status(404).json({ error: 'Session introuvable' });
        if (blindtest.owner_id !== req.user.userId)
            return res.status(403).json({ error: 'Accès refusé' });
        const { clientName, logoUrl, primaryColor, accentColor } = req.body;
        const now = Date.now();
        await db_js_1.default.query(`INSERT INTO event_branding (blindtest_id, owner_id, client_name, logo_url, primary_color, accent_color, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         client_name = VALUES(client_name),
         logo_url = VALUES(logo_url),
         primary_color = VALUES(primary_color),
         accent_color = VALUES(accent_color),
         updated_at = VALUES(updated_at)`, [
            req.params.blindtestId,
            req.user.userId,
            String(clientName || '').slice(0, 255),
            logoUrl ? String(logoUrl).slice(0, 2000) : null,
            String(primaryColor || '#6366f1').slice(0, 16),
            String(accentColor || '#a855f7').slice(0, 16),
            now,
            now,
        ]);
        return res.json({ success: true });
    }
    catch (error) {
        console.error('events branding put error', error);
        return res.status(500).json({ error: 'Erreur serveur' });
    }
});
router.get('/report/:blindtestId', async (req, res) => {
    try {
        await ensureSchema();
        const [bRows] = await db_js_1.default.query('SELECT id, owner_id, title, mode, game_id, created_at, ended_at FROM blindtests WHERE id = ?', [req.params.blindtestId]);
        const blindtest = bRows[0];
        if (!blindtest)
            return res.status(404).json({ error: 'Session introuvable' });
        if (blindtest.owner_id !== req.user.userId)
            return res.status(403).json({ error: 'Accès refusé' });
        const [brandingRows] = await db_js_1.default.query('SELECT client_name, logo_url, primary_color, accent_color FROM event_branding WHERE blindtest_id = ?', [req.params.blindtestId]);
        const branding = brandingRows[0] || null;
        const games = readGames();
        const game = games[blindtest.game_id] || null;
        const players = game?.players ? Object.values(game.players) : [];
        const participants = players.length;
        const totalBuzzes = players.reduce((sum, p) => sum + Number(p?.stats?.buzzes || 0), 0);
        const totalCorrect = players.reduce((sum, p) => sum + Number(p?.stats?.correctAnswers || 0), 0);
        const totalWrong = players.reduce((sum, p) => sum + Number(p?.stats?.wrongAnswers || 0), 0);
        const topPlayers = players
            .map((p) => ({ name: String(p?.name || 'Joueur'), score: Number(p?.score || 0) }))
            .sort((a, b) => b.score - a.score)
            .slice(0, 10);
        return res.json({
            blindtest,
            branding,
            kpi: {
                participants,
                totalBuzzes,
                totalCorrect,
                totalWrong,
                successRate: totalBuzzes > 0 ? Math.round((totalCorrect / totalBuzzes) * 100) : 0,
            },
            topPlayers,
        });
    }
    catch (error) {
        console.error('events report error', error);
        return res.status(500).json({ error: 'Erreur serveur' });
    }
});
exports.default = router;
