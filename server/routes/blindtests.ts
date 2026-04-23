import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';
import pool from '../db.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.use(requireAuth);

router.get('/stats', async (req: Request, res: Response) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, status, created_at, ended_at, game_id FROM blindtests WHERE owner_id = ? ORDER BY created_at DESC LIMIT 300',
      [req.user!.userId],
    );
    const sessions = rows as Array<{
      id: string;
      status: 'active' | 'finished';
      created_at: number;
      ended_at?: number | null;
      game_id: string;
    }>;

    const gamesFile = path.resolve(process.cwd(), 'data', 'games.json');
    let gamesById: Record<string, any> = {};
    if (fs.existsSync(gamesFile)) {
      try {
        const raw = fs.readFileSync(gamesFile, 'utf-8');
        gamesById = raw ? JSON.parse(raw) : {};
      } catch (error) {
        console.warn('blindtests stats: lecture games.json impossible', error);
      }
    }

    const sessionDurationsMs: number[] = [];
    let totalBuzzes = 0;
    let totalCorrect = 0;
    let totalWrong = 0;
    const allResponseTimes: number[] = [];
    const sessionsWithRealtimeStats = { count: 0 };
    const players: Record<string, { id: string; name: string; buzzes: number; responseMsTotal: number }> = {};
    const tracks: Array<{
      trackIndex: number;
      title: string;
      artist: string;
      fastestBuzzMs?: number;
      revealedWithoutAnswer: number;
      wrongAnswers: number;
      totalBuzzes: number;
      correctAnswers: number;
    }> = [];

    for (const session of sessions) {
      const endTs = typeof session.ended_at === 'number' ? session.ended_at : Date.now();
      if (typeof session.created_at === 'number' && endTs > session.created_at) {
        sessionDurationsMs.push(endTs - session.created_at);
      }

      const game = gamesById[session.game_id];
      if (!game || typeof game !== 'object') continue;
      sessionsWithRealtimeStats.count += 1;

      const gamePlayers = game.players || {};
      const gameTrackStats = game.trackStats || {};

      for (const [playerId, player] of Object.entries<any>(gamePlayers)) {
        const buzzes = Number(player?.stats?.buzzes || 0);
        const correct = Number(player?.stats?.correctAnswers || 0);
        const wrong = Number(player?.stats?.wrongAnswers || 0);
        totalBuzzes += buzzes;
        totalCorrect += correct;
        totalWrong += wrong;
        if (!players[playerId]) {
          players[playerId] = { id: playerId, name: String(player?.name || 'Joueur'), buzzes: 0, responseMsTotal: 0 };
        }
        players[playerId].buzzes += buzzes;
      }

      for (const entry of Object.values<any>(gameTrackStats)) {
        const totalEntryBuzzes = Number(entry?.totalBuzzes || 0);
        const fastestBuzzMs = typeof entry?.fastestBuzzMs === 'number' ? Number(entry.fastestBuzzMs) : undefined;
        if (typeof fastestBuzzMs === 'number' && totalEntryBuzzes > 0) {
          allResponseTimes.push(fastestBuzzMs);
          const fastestBuzzPlayerId = String(entry?.fastestBuzzPlayerId || '');
          if (fastestBuzzPlayerId && players[fastestBuzzPlayerId]) {
            players[fastestBuzzPlayerId].responseMsTotal += fastestBuzzMs;
          }
        }
        tracks.push({
          trackIndex: Number(entry?.trackIndex || 0),
          title: String(entry?.title || 'Titre masqué'),
          artist: String(entry?.artist || ''),
          fastestBuzzMs,
          revealedWithoutAnswer: Number(entry?.revealedWithoutAnswer || 0),
          wrongAnswers: Number(entry?.wrongAnswers || 0),
          totalBuzzes: totalEntryBuzzes,
          correctAnswers: Number(entry?.correctAnswers || 0),
        });
      }
    }

    const avgSessionDurationMs =
      sessionDurationsMs.length > 0
        ? Math.round(sessionDurationsMs.reduce((sum, value) => sum + value, 0) / sessionDurationsMs.length)
        : 0;
    const avgResponseMs =
      allResponseTimes.length > 0
        ? Math.round(allResponseTimes.reduce((sum, value) => sum + value, 0) / allResponseTimes.length)
        : 0;

    const topFastPlayers = Object.values(players)
      .filter((player) => player.buzzes > 0 && player.responseMsTotal > 0)
      .map((player) => ({
        id: player.id,
        name: player.name,
        buzzes: player.buzzes,
        avgResponseMs: Math.round(player.responseMsTotal / player.buzzes),
      }))
      .sort((a, b) => a.avgResponseMs - b.avgResponseMs)
      .slice(0, 5);

    const topFastTracks = tracks
      .filter((track) => typeof track.fastestBuzzMs === 'number')
      .sort((a, b) => (a.fastestBuzzMs || 999999) - (b.fastestBuzzMs || 999999))
      .slice(0, 8);

    const topHardTracks = tracks
      .slice()
      .sort(
        (a, b) =>
          b.revealedWithoutAnswer - a.revealedWithoutAnswer ||
          b.wrongAnswers - a.wrongAnswers ||
          b.totalBuzzes - a.totalBuzzes,
      )
      .slice(0, 8);

    return res.json({
      overview: {
        totalSessions: sessions.length,
        finishedSessions: sessions.filter((session) => session.status === 'finished').length,
        activeSessions: sessions.filter((session) => session.status === 'active').length,
        avgSessionDurationMs,
        avgResponseMs,
        totalBuzzes,
        totalCorrect,
        totalWrong,
      },
      topFastPlayers,
      topFastTracks,
      topHardTracks,
      coverage: {
        sessionsWithRealtimeStats: sessionsWithRealtimeStats.count,
        totalSessions: sessions.length,
      },
    });
  } catch (err) {
    console.error('GET blindtests stats error', err);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.get('/', async (req: Request, res: Response) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM blindtests WHERE owner_id = ? ORDER BY created_at DESC',
      [req.user!.userId],
    );
    return res.json({ blindtests: rows });
  } catch (err) {
    console.error('GET blindtests error', err);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.post('/', async (req: Request, res: Response) => {
  const { title, mode, status, gameId, hostToken, playlistId, sourceUrl } = req.body as {
    title?: string;
    mode?: string;
    status?: string;
    gameId?: string;
    hostToken?: string;
    playlistId?: string;
    sourceUrl?: string;
  };
  if (!title || !mode || !gameId) {
    return res.status(400).json({ error: 'title, mode et gameId sont requis' });
  }
  try {
    const id = uuidv4();
    const now = Date.now();
    await pool.query(
      'INSERT INTO blindtests (id, owner_id, title, mode, status, game_id, host_token, playlist_id, source_url, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [id, req.user!.userId, title, mode, status || 'active', gameId, hostToken || null, playlistId || null, sourceUrl || null, now],
    );
    return res.status(201).json({
      blindtest: { id, owner_id: req.user!.userId, title, mode, status: status || 'active', game_id: gameId, host_token: hostToken || null, playlist_id: playlistId || null, source_url: sourceUrl || null, created_at: now },
    });
  } catch (err) {
    console.error('POST blindtest error', err);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const [rows] = await pool.query('SELECT id, owner_id FROM blindtests WHERE id = ?', [req.params.id]);
    const bt = (rows as any[])[0];
    if (!bt) return res.status(404).json({ error: 'BlindTest introuvable' });
    if (bt.owner_id !== req.user!.userId) return res.status(403).json({ error: 'Accès refusé' });

    const { status, endedAt } = req.body as { status?: string; endedAt?: number };
    const updates: string[] = [];
    const values: unknown[] = [];
    if (status !== undefined) { updates.push('status = ?'); values.push(status); }
    if (endedAt !== undefined) { updates.push('ended_at = ?'); values.push(endedAt); }
    if (updates.length === 0) return res.status(400).json({ error: 'Aucune donnée à mettre à jour' });
    values.push(req.params.id);
    await pool.query(`UPDATE blindtests SET ${updates.join(', ')} WHERE id = ?`, values);
    return res.json({ success: true });
  } catch (err) {
    console.error('PATCH blindtest error', err);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.post('/:id/force-end', async (req: Request, res: Response) => {
  try {
    const [rows] = await pool.query('SELECT id, owner_id, status FROM blindtests WHERE id = ?', [req.params.id]);
    const bt = (rows as any[])[0];
    if (!bt) return res.status(404).json({ error: 'BlindTest introuvable' });
    if (bt.owner_id !== req.user!.userId) return res.status(403).json({ error: 'Accès refusé' });

    const endedAt = Date.now();
    await pool.query('UPDATE blindtests SET status = ?, ended_at = ? WHERE id = ?', ['finished', endedAt, req.params.id]);
    return res.json({ success: true, endedAt });
  } catch (err) {
    console.error('POST force-end blindtest error', err);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
});

export default router;
