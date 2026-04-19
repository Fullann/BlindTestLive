import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import pool from '../db.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.use(requireAuth);

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
