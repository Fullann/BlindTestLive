import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import pool from '../db.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
let storeSchemaChecked = false;
let collabSchemaChecked = false;

async function columnExists(tableName: string, columnName: string): Promise<boolean> {
  const [rows] = await pool.query(
    `SELECT 1
     FROM information_schema.columns
     WHERE table_schema = DATABASE()
       AND table_name = ?
       AND column_name = ?
     LIMIT 1`,
    [tableName, columnName],
  );
  return (rows as any[]).length > 0;
}

async function addColumnIfMissing(tableName: string, columnName: string, definition: string) {
  const exists = await columnExists(tableName, columnName);
  if (exists) return;
  try {
    await pool.query(`ALTER TABLE ${tableName} ADD COLUMN ${definition}`);
  } catch (error: any) {
    if (error?.code !== 'ER_DUP_FIELDNAME') {
      throw error;
    }
  }
}

async function ensureStoreSchema() {
  if (storeSchemaChecked) return;
  await pool.query(
    'CREATE TABLE IF NOT EXISTS playlist_likes (playlist_id VARCHAR(36) NOT NULL, user_id VARCHAR(36) NOT NULL, created_at BIGINT NOT NULL, PRIMARY KEY (playlist_id, user_id), INDEX idx_playlist_likes_user (user_id))',
  );
  await addColumnIfMissing('playlists', 'category', "category VARCHAR(64) NOT NULL DEFAULT 'general'");
  await addColumnIfMissing('playlists', 'likes_count', 'likes_count INT NOT NULL DEFAULT 0');
  await addColumnIfMissing('playlists', 'downloads_count', 'downloads_count INT NOT NULL DEFAULT 0');
  storeSchemaChecked = true;
}

async function ensureCollabSchema() {
  if (collabSchemaChecked) return;
  await pool.query(
    `CREATE TABLE IF NOT EXISTS playlist_collab_tokens (
      playlist_id VARCHAR(36) NOT NULL,
      token VARCHAR(128) NOT NULL,
      created_by VARCHAR(36) NOT NULL,
      created_at BIGINT NOT NULL,
      expires_at BIGINT NOT NULL,
      PRIMARY KEY (playlist_id, token),
      INDEX idx_playlist_collab_exp (expires_at)
    )`,
  );
  await addColumnIfMissing('playlist_collab_tokens', 'permission', "permission VARCHAR(16) NOT NULL DEFAULT 'edit'");
  await addColumnIfMissing('playlist_collab_tokens', 'revoked_at', 'revoked_at BIGINT NULL');
  collabSchemaChecked = true;
}

async function getCollabAccess(
  playlist: any,
  userId: string,
  collabToken?: string | null,
): Promise<{ allowed: boolean; permission: 'view' | 'edit' }> {
  if (playlist.owner_id === userId) return { allowed: true, permission: 'edit' };
  if (!collabToken) return { allowed: false, permission: 'view' };
  await ensureCollabSchema();
  const [rows] = await pool.query(
    `SELECT permission FROM playlist_collab_tokens
     WHERE playlist_id = ? AND token = ? AND expires_at > ? AND (revoked_at IS NULL OR revoked_at = 0)
     LIMIT 1`,
    [playlist.id, collabToken, Date.now()],
  );
  const tokenRow = (rows as any[])[0];
  if (!tokenRow) return { allowed: false, permission: 'view' };
  const permission = String(tokenRow.permission || 'edit') === 'view' ? 'view' : 'edit';
  return { allowed: true, permission };
}

function parseTracksValue(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function getUploadsDir(playlistId: string): string {
  return path.resolve(process.cwd(), 'uploads', 'playlists', playlistId);
}

const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const playlistId = (req.params.playlistId as string) || 'wizard';
    const dir = getUploadsDir(playlistId);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const safeName = file.originalname.replace(/\s+/g, '_');
    cb(null, `${Date.now()}_${safeName}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 200 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['audio/', 'video/', 'image/'];
    if (allowed.some((prefix) => file.mimetype.startsWith(prefix))) {
      cb(null, true);
    } else {
      cb(new Error('Type de fichier non autorisé'));
    }
  },
});

router.get('/store', async (_req: Request, res: Response) => {
  try {
    await ensureStoreSchema();
    const sort = (_req.query.sort as string) === 'popular' ? 'popular' : 'recent';
    const category = (_req.query.category as string)?.trim();
    const orderClause =
      sort === 'popular'
        ? 'ORDER BY p.likes_count DESC, p.downloads_count DESC, p.created_at DESC'
        : 'ORDER BY p.created_at DESC';
    const whereClause = category ? "AND p.category = ?" : '';
    const params = category ? [category] : [];
    const [rows] = await pool.query(
      `SELECT p.id, p.name, p.owner_id, p.tracks, p.visibility, p.created_at, p.category, p.likes_count, p.downloads_count, u.email AS owner_email
       FROM playlists p
       LEFT JOIN users u ON u.id = p.owner_id
       WHERE p.visibility = 'public' ${whereClause}
       ${orderClause}`,
      params,
    );
    const normalized = (rows as any[]).map((row) => ({
      ...row,
      tracks: parseTracksValue(row.tracks),
    }));
    return res.json({ playlists: normalized });
  } catch (err) {
    console.error('GET store playlists error', err);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.post('/:id/store/download', async (req: Request, res: Response) => {
  try {
    await ensureStoreSchema();
    const [rows] = await pool.query(
      "SELECT id FROM playlists WHERE id = ? AND visibility = 'public'",
      [req.params.id],
    );
    if (!(rows as any[])[0]) return res.status(404).json({ error: 'Blind test introuvable' });
    await pool.query('UPDATE playlists SET downloads_count = downloads_count + 1 WHERE id = ?', [req.params.id]);
    return res.json({ success: true });
  } catch (err) {
    console.error('POST store download error', err);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.use(requireAuth);

router.post('/:id/collab-token', async (req: Request, res: Response) => {
  try {
    await ensureCollabSchema();
    const [rows] = await pool.query('SELECT id, owner_id FROM playlists WHERE id = ?', [req.params.id]);
    const playlist = (rows as any[])[0];
    if (!playlist) return res.status(404).json({ error: 'Playlist introuvable' });
    if (playlist.owner_id !== req.user!.userId) return res.status(403).json({ error: 'Accès refusé' });
    const token = `${uuidv4().replace(/-/g, '')}${Date.now().toString(36)}`;
    const now = Date.now();
    const requestedPermission = String((req.body?.permission as string) || 'edit');
    const permission: 'view' | 'edit' = requestedPermission === 'view' ? 'view' : 'edit';
    const expiresHours = Math.max(1, Math.min(24 * 30, Number(req.body?.expiresHours) || 24));
    const expiresAt = now + expiresHours * 60 * 60 * 1000;
    await pool.query(
      'INSERT INTO playlist_collab_tokens (playlist_id, token, created_by, created_at, expires_at, permission, revoked_at) VALUES (?, ?, ?, ?, ?, ?, NULL)',
      [playlist.id, token, req.user!.userId, now, expiresAt, permission],
    );
    return res.json({ token, expiresAt, permission });
  } catch (err) {
    console.error('POST collab token error', err);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.get('/:id/collab-tokens', async (req: Request, res: Response) => {
  try {
    await ensureCollabSchema();
    const [rows] = await pool.query('SELECT id, owner_id FROM playlists WHERE id = ?', [req.params.id]);
    const playlist = (rows as any[])[0];
    if (!playlist) return res.status(404).json({ error: 'Playlist introuvable' });
    if (playlist.owner_id !== req.user!.userId) return res.status(403).json({ error: 'Accès refusé' });
    const [tokensRows] = await pool.query(
      `SELECT token, created_by, created_at, expires_at, permission, revoked_at
       FROM playlist_collab_tokens
       WHERE playlist_id = ?
       ORDER BY created_at DESC
       LIMIT 100`,
      [req.params.id],
    );
    return res.json({ tokens: tokensRows });
  } catch (err) {
    console.error('GET collab tokens error', err);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.delete('/:id/collab-token/:token', async (req: Request, res: Response) => {
  try {
    await ensureCollabSchema();
    const [rows] = await pool.query('SELECT id, owner_id FROM playlists WHERE id = ?', [req.params.id]);
    const playlist = (rows as any[])[0];
    if (!playlist) return res.status(404).json({ error: 'Playlist introuvable' });
    if (playlist.owner_id !== req.user!.userId) return res.status(403).json({ error: 'Accès refusé' });
    await pool.query(
      'UPDATE playlist_collab_tokens SET revoked_at = ? WHERE playlist_id = ? AND token = ?',
      [Date.now(), req.params.id, req.params.token],
    );
    return res.json({ success: true });
  } catch (err) {
    console.error('DELETE collab token error', err);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.get('/', async (req: Request, res: Response) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM playlists WHERE owner_id = ? ORDER BY created_at DESC',
      [req.user!.userId],
    );
    return res.json({ playlists: rows });
  } catch (err) {
    console.error('GET playlists error', err);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.get('/public', async (req: Request, res: Response) => {
  try {
    await ensureStoreSchema();
    const [rows] = await pool.query(
      "SELECT * FROM playlists WHERE visibility = 'public' AND owner_id != ? ORDER BY likes_count DESC, downloads_count DESC, created_at DESC",
      [req.user!.userId],
    );
    return res.json({ playlists: rows });
  } catch (err) {
    console.error('GET public playlists error', err);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.get('/store/likes', async (req: Request, res: Response) => {
  try {
    await ensureStoreSchema();
    const [rows] = await pool.query(
      'SELECT playlist_id FROM playlist_likes WHERE user_id = ?',
      [req.user!.userId],
    );
    return res.json({ likedPlaylistIds: (rows as any[]).map((row) => row.playlist_id) });
  } catch (err) {
    console.error('GET store likes error', err);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.post('/:id/store/like', async (req: Request, res: Response) => {
  try {
    await ensureStoreSchema();
    const playlistId = req.params.id;
    const userId = req.user!.userId;
    const [playlists] = await pool.query("SELECT id FROM playlists WHERE id = ? AND visibility = 'public'", [playlistId]);
    if (!(playlists as any[])[0]) return res.status(404).json({ error: 'Blind test introuvable' });
    const [likes] = await pool.query('SELECT playlist_id FROM playlist_likes WHERE playlist_id = ? AND user_id = ?', [playlistId, userId]);
    const alreadyLiked = !!(likes as any[])[0];
    if (alreadyLiked) {
      await pool.query('DELETE FROM playlist_likes WHERE playlist_id = ? AND user_id = ?', [playlistId, userId]);
      await pool.query('UPDATE playlists SET likes_count = GREATEST(likes_count - 1, 0) WHERE id = ?', [playlistId]);
      return res.json({ success: true, liked: false });
    }
    await pool.query('INSERT INTO playlist_likes (playlist_id, user_id, created_at) VALUES (?, ?, ?)', [playlistId, userId, Date.now()]);
    await pool.query('UPDATE playlists SET likes_count = likes_count + 1 WHERE id = ?', [playlistId]);
    return res.json({ success: true, liked: true });
  } catch (err) {
    console.error('POST store like error', err);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const [rows] = await pool.query('SELECT * FROM playlists WHERE id = ?', [req.params.id]);
    const playlist = (rows as any[])[0];
    if (!playlist) return res.status(404).json({ error: 'Playlist introuvable' });
    const collabToken = String((req.query.collabToken as string) || '');
    const access = await getCollabAccess(playlist, req.user!.userId, collabToken || null);
    if (!access.allowed && playlist.visibility !== 'public') {
      return res.status(403).json({ error: 'Accès refusé' });
    }
    return res.json({ playlist, permission: access.allowed ? access.permission : 'view' });
  } catch (err) {
    console.error('GET playlist error', err);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.post('/', async (req: Request, res: Response) => {
  const { name, tracks, visibility, category } = req.body as {
    name?: string;
    tracks?: unknown[];
    visibility?: string;
    category?: string;
  };
  if (!name?.trim()) return res.status(400).json({ error: 'Nom requis' });
  try {
    await ensureStoreSchema();
    const id = uuidv4();
    const now = Date.now();
    const safeCategory = (category || 'general').trim().slice(0, 64) || 'general';
    await pool.query(
      'INSERT INTO playlists (id, name, owner_id, tracks, visibility, category, likes_count, downloads_count, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [id, name.trim(), req.user!.userId, JSON.stringify(tracks || []), visibility || 'private', safeCategory, 0, 0, now],
    );
    return res.status(201).json({ playlist: { id, name: name.trim(), owner_id: req.user!.userId, tracks: tracks || [], visibility: visibility || 'private', category: safeCategory, likes_count: 0, downloads_count: 0, created_at: now } });
  } catch (err) {
    console.error('POST playlist error', err);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.put('/:id', async (req: Request, res: Response) => {
  try {
    const [rows] = await pool.query('SELECT id, owner_id FROM playlists WHERE id = ?', [req.params.id]);
    const playlist = (rows as any[])[0];
    if (!playlist) return res.status(404).json({ error: 'Playlist introuvable' });
    const collabToken = String((req.body?.collabToken as string) || '');
    const access = await getCollabAccess(playlist, req.user!.userId, collabToken || null);
    if (!access.allowed) return res.status(403).json({ error: 'Accès refusé' });
    if (playlist.owner_id !== req.user!.userId && access.permission !== 'edit') {
      return res.status(403).json({ error: 'Lien en lecture seule' });
    }

    const { name, tracks, visibility, category } = req.body as { name?: string; tracks?: unknown[]; visibility?: string; category?: string };
    const updates: string[] = [];
    const values: unknown[] = [];
    if (name !== undefined) { updates.push('name = ?'); values.push(name); }
    if (tracks !== undefined) { updates.push('tracks = ?'); values.push(JSON.stringify(tracks)); }
    if (visibility !== undefined) { updates.push('visibility = ?'); values.push(visibility); }
    if (category !== undefined) { updates.push('category = ?'); values.push((category || 'general').trim().slice(0, 64) || 'general'); }
    if (updates.length === 0) return res.status(400).json({ error: 'Aucune donnée à mettre à jour' });
    values.push(req.params.id);
    await pool.query(`UPDATE playlists SET ${updates.join(', ')} WHERE id = ?`, values);
    return res.json({ success: true });
  } catch (err) {
    console.error('PUT playlist error', err);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const [rows] = await pool.query('SELECT id, owner_id FROM playlists WHERE id = ?', [req.params.id]);
    const playlist = (rows as any[])[0];
    if (!playlist) return res.status(404).json({ error: 'Playlist introuvable' });
    if (playlist.owner_id !== req.user!.userId) return res.status(403).json({ error: 'Accès refusé' });
    await pool.query('DELETE FROM playlists WHERE id = ?', [req.params.id]);

    const uploadsDir = getUploadsDir(req.params.id);
    if (fs.existsSync(uploadsDir)) {
      fs.rmSync(uploadsDir, { recursive: true, force: true });
    }
    return res.json({ success: true });
  } catch (err) {
    console.error('DELETE playlist error', err);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.post('/:playlistId/upload', upload.single('file'), async (req: Request, res: Response) => {
  if (!req.file) return res.status(400).json({ error: 'Fichier manquant' });
  const playlistId = req.params.playlistId;

  const [rows] = await pool.query('SELECT id, owner_id FROM playlists WHERE id = ?', [playlistId]);
  const playlist = (rows as any[])[0];
  if (playlistId !== 'wizard' && (!playlist || playlist.owner_id !== req.user!.userId)) {
    fs.unlinkSync(req.file.path);
    return res.status(403).json({ error: 'Accès refusé' });
  }

  const relativePath = path.relative(path.resolve(process.cwd(), 'uploads'), req.file.path).replace(/\\/g, '/');
  const fileUrl = `/uploads/${relativePath}`;
  return res.json({ url: fileUrl, filename: req.file.filename, mimetype: req.file.mimetype });
});

export default router;
