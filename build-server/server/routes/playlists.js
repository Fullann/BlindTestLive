"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const uuid_1 = require("uuid");
const db_js_1 = __importDefault(require("../db.js"));
const auth_js_1 = require("../middleware/auth.js");
const router = (0, express_1.Router)();
let storeSchemaChecked = false;
let collabSchemaChecked = false;
async function columnExists(tableName, columnName) {
    const [rows] = await db_js_1.default.query(`SELECT 1
     FROM information_schema.columns
     WHERE table_schema = DATABASE()
       AND table_name = ?
       AND column_name = ?
     LIMIT 1`, [tableName, columnName]);
    return rows.length > 0;
}
async function addColumnIfMissing(tableName, columnName, definition) {
    const exists = await columnExists(tableName, columnName);
    if (exists)
        return;
    try {
        await db_js_1.default.query(`ALTER TABLE ${tableName} ADD COLUMN ${definition}`);
    }
    catch (error) {
        if (error?.code !== 'ER_DUP_FIELDNAME') {
            throw error;
        }
    }
}
async function ensureStoreSchema() {
    if (storeSchemaChecked)
        return;
    await db_js_1.default.query('CREATE TABLE IF NOT EXISTS playlist_likes (playlist_id VARCHAR(36) NOT NULL, user_id VARCHAR(36) NOT NULL, created_at BIGINT NOT NULL, PRIMARY KEY (playlist_id, user_id), INDEX idx_playlist_likes_user (user_id))');
    await addColumnIfMissing('playlists', 'category', "category VARCHAR(64) NOT NULL DEFAULT 'general'");
    await addColumnIfMissing('playlists', 'likes_count', 'likes_count INT NOT NULL DEFAULT 0');
    await addColumnIfMissing('playlists', 'downloads_count', 'downloads_count INT NOT NULL DEFAULT 0');
    storeSchemaChecked = true;
}
async function ensureCollabSchema() {
    if (collabSchemaChecked)
        return;
    await db_js_1.default.query(`CREATE TABLE IF NOT EXISTS playlist_collab_tokens (
      playlist_id VARCHAR(36) NOT NULL,
      token VARCHAR(128) NOT NULL,
      created_by VARCHAR(36) NOT NULL,
      created_at BIGINT NOT NULL,
      expires_at BIGINT NOT NULL,
      PRIMARY KEY (playlist_id, token),
      INDEX idx_playlist_collab_exp (expires_at)
    )`);
    collabSchemaChecked = true;
}
async function canAccessPlaylist(playlist, userId, collabToken) {
    if (playlist.owner_id === userId)
        return true;
    if (!collabToken)
        return false;
    await ensureCollabSchema();
    const [rows] = await db_js_1.default.query(`SELECT 1 FROM playlist_collab_tokens
     WHERE playlist_id = ? AND token = ? AND expires_at > ?
     LIMIT 1`, [playlist.id, collabToken, Date.now()]);
    return rows.length > 0;
}
function parseTracksValue(value) {
    if (Array.isArray(value))
        return value;
    if (typeof value === 'string') {
        try {
            const parsed = JSON.parse(value);
            return Array.isArray(parsed) ? parsed : [];
        }
        catch {
            return [];
        }
    }
    return [];
}
function getUploadsDir(playlistId) {
    return path_1.default.resolve(process.cwd(), 'uploads', 'playlists', playlistId);
}
const storage = multer_1.default.diskStorage({
    destination: (req, _file, cb) => {
        const playlistId = req.params.playlistId || 'wizard';
        const dir = getUploadsDir(playlistId);
        fs_1.default.mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    filename: (_req, file, cb) => {
        const safeName = file.originalname.replace(/\s+/g, '_');
        cb(null, `${Date.now()}_${safeName}`);
    },
});
const upload = (0, multer_1.default)({
    storage,
    limits: { fileSize: 200 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
        const allowed = ['audio/', 'video/', 'image/'];
        if (allowed.some((prefix) => file.mimetype.startsWith(prefix))) {
            cb(null, true);
        }
        else {
            cb(new Error('Type de fichier non autorisé'));
        }
    },
});
router.get('/store', async (_req, res) => {
    try {
        await ensureStoreSchema();
        const sort = _req.query.sort === 'popular' ? 'popular' : 'recent';
        const category = _req.query.category?.trim();
        const orderClause = sort === 'popular'
            ? 'ORDER BY p.likes_count DESC, p.downloads_count DESC, p.created_at DESC'
            : 'ORDER BY p.created_at DESC';
        const whereClause = category ? "AND p.category = ?" : '';
        const params = category ? [category] : [];
        const [rows] = await db_js_1.default.query(`SELECT p.id, p.name, p.owner_id, p.tracks, p.visibility, p.created_at, p.category, p.likes_count, p.downloads_count, u.email AS owner_email
       FROM playlists p
       LEFT JOIN users u ON u.id = p.owner_id
       WHERE p.visibility = 'public' ${whereClause}
       ${orderClause}`, params);
        const normalized = rows.map((row) => ({
            ...row,
            tracks: parseTracksValue(row.tracks),
        }));
        return res.json({ playlists: normalized });
    }
    catch (err) {
        console.error('GET store playlists error', err);
        return res.status(500).json({ error: 'Erreur serveur' });
    }
});
router.post('/:id/store/download', async (req, res) => {
    try {
        await ensureStoreSchema();
        const [rows] = await db_js_1.default.query("SELECT id FROM playlists WHERE id = ? AND visibility = 'public'", [req.params.id]);
        if (!rows[0])
            return res.status(404).json({ error: 'Blind test introuvable' });
        await db_js_1.default.query('UPDATE playlists SET downloads_count = downloads_count + 1 WHERE id = ?', [req.params.id]);
        return res.json({ success: true });
    }
    catch (err) {
        console.error('POST store download error', err);
        return res.status(500).json({ error: 'Erreur serveur' });
    }
});
router.use(auth_js_1.requireAuth);
router.post('/:id/collab-token', async (req, res) => {
    try {
        await ensureCollabSchema();
        const [rows] = await db_js_1.default.query('SELECT id, owner_id FROM playlists WHERE id = ?', [req.params.id]);
        const playlist = rows[0];
        if (!playlist)
            return res.status(404).json({ error: 'Playlist introuvable' });
        if (playlist.owner_id !== req.user.userId)
            return res.status(403).json({ error: 'Accès refusé' });
        const token = `${(0, uuid_1.v4)().replace(/-/g, '')}${Date.now().toString(36)}`;
        const now = Date.now();
        const expiresAt = now + 24 * 60 * 60 * 1000;
        await db_js_1.default.query('INSERT INTO playlist_collab_tokens (playlist_id, token, created_by, created_at, expires_at) VALUES (?, ?, ?, ?, ?)', [playlist.id, token, req.user.userId, now, expiresAt]);
        return res.json({ token, expiresAt });
    }
    catch (err) {
        console.error('POST collab token error', err);
        return res.status(500).json({ error: 'Erreur serveur' });
    }
});
router.get('/', async (req, res) => {
    try {
        const [rows] = await db_js_1.default.query('SELECT * FROM playlists WHERE owner_id = ? ORDER BY created_at DESC', [req.user.userId]);
        return res.json({ playlists: rows });
    }
    catch (err) {
        console.error('GET playlists error', err);
        return res.status(500).json({ error: 'Erreur serveur' });
    }
});
router.get('/public', async (req, res) => {
    try {
        await ensureStoreSchema();
        const [rows] = await db_js_1.default.query("SELECT * FROM playlists WHERE visibility = 'public' AND owner_id != ? ORDER BY likes_count DESC, downloads_count DESC, created_at DESC", [req.user.userId]);
        return res.json({ playlists: rows });
    }
    catch (err) {
        console.error('GET public playlists error', err);
        return res.status(500).json({ error: 'Erreur serveur' });
    }
});
router.get('/store/likes', async (req, res) => {
    try {
        await ensureStoreSchema();
        const [rows] = await db_js_1.default.query('SELECT playlist_id FROM playlist_likes WHERE user_id = ?', [req.user.userId]);
        return res.json({ likedPlaylistIds: rows.map((row) => row.playlist_id) });
    }
    catch (err) {
        console.error('GET store likes error', err);
        return res.status(500).json({ error: 'Erreur serveur' });
    }
});
router.post('/:id/store/like', async (req, res) => {
    try {
        await ensureStoreSchema();
        const playlistId = req.params.id;
        const userId = req.user.userId;
        const [playlists] = await db_js_1.default.query("SELECT id FROM playlists WHERE id = ? AND visibility = 'public'", [playlistId]);
        if (!playlists[0])
            return res.status(404).json({ error: 'Blind test introuvable' });
        const [likes] = await db_js_1.default.query('SELECT playlist_id FROM playlist_likes WHERE playlist_id = ? AND user_id = ?', [playlistId, userId]);
        const alreadyLiked = !!likes[0];
        if (alreadyLiked) {
            await db_js_1.default.query('DELETE FROM playlist_likes WHERE playlist_id = ? AND user_id = ?', [playlistId, userId]);
            await db_js_1.default.query('UPDATE playlists SET likes_count = GREATEST(likes_count - 1, 0) WHERE id = ?', [playlistId]);
            return res.json({ success: true, liked: false });
        }
        await db_js_1.default.query('INSERT INTO playlist_likes (playlist_id, user_id, created_at) VALUES (?, ?, ?)', [playlistId, userId, Date.now()]);
        await db_js_1.default.query('UPDATE playlists SET likes_count = likes_count + 1 WHERE id = ?', [playlistId]);
        return res.json({ success: true, liked: true });
    }
    catch (err) {
        console.error('POST store like error', err);
        return res.status(500).json({ error: 'Erreur serveur' });
    }
});
router.get('/:id', async (req, res) => {
    try {
        const [rows] = await db_js_1.default.query('SELECT * FROM playlists WHERE id = ?', [req.params.id]);
        const playlist = rows[0];
        if (!playlist)
            return res.status(404).json({ error: 'Playlist introuvable' });
        const collabToken = String(req.query.collabToken || '');
        const allowed = await canAccessPlaylist(playlist, req.user.userId, collabToken || null);
        if (!allowed && playlist.visibility !== 'public') {
            return res.status(403).json({ error: 'Accès refusé' });
        }
        return res.json({ playlist });
    }
    catch (err) {
        console.error('GET playlist error', err);
        return res.status(500).json({ error: 'Erreur serveur' });
    }
});
router.post('/', async (req, res) => {
    const { name, tracks, visibility, category } = req.body;
    if (!name?.trim())
        return res.status(400).json({ error: 'Nom requis' });
    try {
        await ensureStoreSchema();
        const id = (0, uuid_1.v4)();
        const now = Date.now();
        const safeCategory = (category || 'general').trim().slice(0, 64) || 'general';
        await db_js_1.default.query('INSERT INTO playlists (id, name, owner_id, tracks, visibility, category, likes_count, downloads_count, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [id, name.trim(), req.user.userId, JSON.stringify(tracks || []), visibility || 'private', safeCategory, 0, 0, now]);
        return res.status(201).json({ playlist: { id, name: name.trim(), owner_id: req.user.userId, tracks: tracks || [], visibility: visibility || 'private', category: safeCategory, likes_count: 0, downloads_count: 0, created_at: now } });
    }
    catch (err) {
        console.error('POST playlist error', err);
        return res.status(500).json({ error: 'Erreur serveur' });
    }
});
router.put('/:id', async (req, res) => {
    try {
        const [rows] = await db_js_1.default.query('SELECT id, owner_id FROM playlists WHERE id = ?', [req.params.id]);
        const playlist = rows[0];
        if (!playlist)
            return res.status(404).json({ error: 'Playlist introuvable' });
        const collabToken = String(req.body?.collabToken || '');
        const allowed = await canAccessPlaylist(playlist, req.user.userId, collabToken || null);
        if (!allowed)
            return res.status(403).json({ error: 'Accès refusé' });
        const { name, tracks, visibility, category } = req.body;
        const updates = [];
        const values = [];
        if (name !== undefined) {
            updates.push('name = ?');
            values.push(name);
        }
        if (tracks !== undefined) {
            updates.push('tracks = ?');
            values.push(JSON.stringify(tracks));
        }
        if (visibility !== undefined) {
            updates.push('visibility = ?');
            values.push(visibility);
        }
        if (category !== undefined) {
            updates.push('category = ?');
            values.push((category || 'general').trim().slice(0, 64) || 'general');
        }
        if (updates.length === 0)
            return res.status(400).json({ error: 'Aucune donnée à mettre à jour' });
        values.push(req.params.id);
        await db_js_1.default.query(`UPDATE playlists SET ${updates.join(', ')} WHERE id = ?`, values);
        return res.json({ success: true });
    }
    catch (err) {
        console.error('PUT playlist error', err);
        return res.status(500).json({ error: 'Erreur serveur' });
    }
});
router.delete('/:id', async (req, res) => {
    try {
        const [rows] = await db_js_1.default.query('SELECT id, owner_id FROM playlists WHERE id = ?', [req.params.id]);
        const playlist = rows[0];
        if (!playlist)
            return res.status(404).json({ error: 'Playlist introuvable' });
        if (playlist.owner_id !== req.user.userId)
            return res.status(403).json({ error: 'Accès refusé' });
        await db_js_1.default.query('DELETE FROM playlists WHERE id = ?', [req.params.id]);
        const uploadsDir = getUploadsDir(req.params.id);
        if (fs_1.default.existsSync(uploadsDir)) {
            fs_1.default.rmSync(uploadsDir, { recursive: true, force: true });
        }
        return res.json({ success: true });
    }
    catch (err) {
        console.error('DELETE playlist error', err);
        return res.status(500).json({ error: 'Erreur serveur' });
    }
});
router.post('/:playlistId/upload', upload.single('file'), async (req, res) => {
    if (!req.file)
        return res.status(400).json({ error: 'Fichier manquant' });
    const playlistId = req.params.playlistId;
    const [rows] = await db_js_1.default.query('SELECT id, owner_id FROM playlists WHERE id = ?', [playlistId]);
    const playlist = rows[0];
    if (playlistId !== 'wizard' && (!playlist || playlist.owner_id !== req.user.userId)) {
        fs_1.default.unlinkSync(req.file.path);
        return res.status(403).json({ error: 'Accès refusé' });
    }
    const relativePath = path_1.default.relative(path_1.default.resolve(process.cwd(), 'uploads'), req.file.path).replace(/\\/g, '/');
    const fileUrl = `/uploads/${relativePath}`;
    return res.json({ url: fileUrl, filename: req.file.filename, mimetype: req.file.mimetype });
});
exports.default = router;
