"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const uuid_1 = require("uuid");
const db_js_1 = __importDefault(require("../db.js"));
const router = (0, express_1.Router)();
let schemaChecked = false;
async function ensureSchema() {
    if (schemaChecked)
        return;
    await db_js_1.default.query(`CREATE TABLE IF NOT EXISTS player_profiles (
      public_id VARCHAR(64) NOT NULL PRIMARY KEY,
      nickname VARCHAR(32) NOT NULL,
      badges_json JSON NOT NULL,
      seasons_json JSON NOT NULL,
      total_sessions INT NOT NULL DEFAULT 0,
      total_score INT NOT NULL DEFAULT 0,
      total_buzzes INT NOT NULL DEFAULT 0,
      total_correct INT NOT NULL DEFAULT 0,
      total_wrong INT NOT NULL DEFAULT 0,
      created_at BIGINT NOT NULL,
      updated_at BIGINT NOT NULL,
      INDEX idx_player_profiles_nickname (nickname)
    )`);
    await db_js_1.default.query(`CREATE TABLE IF NOT EXISTS player_profile_sessions (
      id VARCHAR(36) NOT NULL PRIMARY KEY,
      public_id VARCHAR(64) NOT NULL,
      game_id VARCHAR(10) NOT NULL,
      player_name VARCHAR(64) NOT NULL,
      score INT NOT NULL DEFAULT 0,
      buzzes INT NOT NULL DEFAULT 0,
      correct_answers INT NOT NULL DEFAULT 0,
      wrong_answers INT NOT NULL DEFAULT 0,
      created_at BIGINT NOT NULL,
      INDEX idx_player_profile_sessions_public (public_id),
      INDEX idx_player_profile_sessions_created (created_at)
    )`);
    schemaChecked = true;
}
function computeBadges(totalSessions, totalCorrect, totalWrong) {
    const badges = [];
    if (totalSessions >= 5)
        badges.push('habitué');
    if (totalSessions >= 20)
        badges.push('vétéran');
    if (totalCorrect >= 50)
        badges.push('oreille d\'or');
    if (totalWrong <= 5 && totalSessions >= 3)
        badges.push('sniper');
    return badges;
}
router.post('/claim', async (req, res) => {
    try {
        await ensureSchema();
        const { publicId, nickname, gameId, playerName, score, buzzes, correctAnswers, wrongAnswers, } = req.body;
        if (!publicId || !nickname || !gameId) {
            return res.status(400).json({ error: 'publicId, nickname et gameId requis' });
        }
        const now = Date.now();
        const safeNickname = String(nickname).trim().slice(0, 32);
        const safePlayerName = String(playerName || safeNickname).trim().slice(0, 64);
        const safeScore = Number(score || 0);
        const safeBuzzes = Number(buzzes || 0);
        const safeCorrect = Number(correctAnswers || 0);
        const safeWrong = Number(wrongAnswers || 0);
        await db_js_1.default.query(`INSERT INTO player_profile_sessions
         (id, public_id, game_id, player_name, score, buzzes, correct_answers, wrong_answers, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [(0, uuid_1.v4)(), String(publicId).slice(0, 64), String(gameId).slice(0, 10), safePlayerName, safeScore, safeBuzzes, safeCorrect, safeWrong, now]);
        const [profileRows] = await db_js_1.default.query('SELECT * FROM player_profiles WHERE public_id = ?', [String(publicId).slice(0, 64)]);
        const existing = profileRows[0];
        if (!existing) {
            const badges = computeBadges(1, safeCorrect, safeWrong);
            const seasons = [{ id: new Date().getFullYear().toString(), sessions: 1, score: safeScore }];
            await db_js_1.default.query(`INSERT INTO player_profiles
           (public_id, nickname, badges_json, seasons_json, total_sessions, total_score, total_buzzes, total_correct, total_wrong, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [String(publicId).slice(0, 64), safeNickname, JSON.stringify(badges), JSON.stringify(seasons), 1, safeScore, safeBuzzes, safeCorrect, safeWrong, now, now]);
        }
        else {
            const nextSessions = Number(existing.total_sessions || 0) + 1;
            const nextScore = Number(existing.total_score || 0) + safeScore;
            const nextBuzzes = Number(existing.total_buzzes || 0) + safeBuzzes;
            const nextCorrect = Number(existing.total_correct || 0) + safeCorrect;
            const nextWrong = Number(existing.total_wrong || 0) + safeWrong;
            const badges = computeBadges(nextSessions, nextCorrect, nextWrong);
            const year = new Date().getFullYear().toString();
            let seasons = [];
            try {
                seasons = Array.isArray(existing.seasons_json) ? existing.seasons_json : JSON.parse(existing.seasons_json || '[]');
            }
            catch {
                seasons = [];
            }
            const idx = seasons.findIndex((s) => s.id === year);
            if (idx >= 0) {
                seasons[idx] = { ...seasons[idx], sessions: Number(seasons[idx].sessions || 0) + 1, score: Number(seasons[idx].score || 0) + safeScore };
            }
            else {
                seasons.push({ id: year, sessions: 1, score: safeScore });
            }
            await db_js_1.default.query(`UPDATE player_profiles
         SET nickname = ?, badges_json = ?, seasons_json = ?, total_sessions = ?, total_score = ?, total_buzzes = ?, total_correct = ?, total_wrong = ?, updated_at = ?
         WHERE public_id = ?`, [safeNickname, JSON.stringify(badges), JSON.stringify(seasons), nextSessions, nextScore, nextBuzzes, nextCorrect, nextWrong, now, String(publicId).slice(0, 64)]);
        }
        return res.json({ success: true });
    }
    catch (err) {
        console.error('player profiles claim error', err);
        return res.status(500).json({ error: 'Erreur serveur' });
    }
});
router.get('/:publicId', async (req, res) => {
    try {
        await ensureSchema();
        const [rows] = await db_js_1.default.query('SELECT * FROM player_profiles WHERE public_id = ?', [req.params.publicId]);
        const profile = rows[0];
        if (!profile)
            return res.status(404).json({ error: 'Profil introuvable' });
        return res.json({ profile });
    }
    catch (err) {
        console.error('player profiles get error', err);
        return res.status(500).json({ error: 'Erreur serveur' });
    }
});
router.get('/:publicId/history', async (req, res) => {
    try {
        await ensureSchema();
        const [rows] = await db_js_1.default.query(`SELECT game_id, player_name, score, buzzes, correct_answers, wrong_answers, created_at
       FROM player_profile_sessions
       WHERE public_id = ?
       ORDER BY created_at DESC
       LIMIT 100`, [req.params.publicId]);
        return res.json({ sessions: rows });
    }
    catch (err) {
        console.error('player profiles history error', err);
        return res.status(500).json({ error: 'Erreur serveur' });
    }
});
exports.default = router;
