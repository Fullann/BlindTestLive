"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const uuid_1 = require("uuid");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const speakeasy_1 = __importDefault(require("speakeasy"));
const qrcode_1 = __importDefault(require("qrcode"));
const db_js_1 = __importDefault(require("../db.js"));
const auth_js_1 = require("../middleware/auth.js");
const router = (0, express_1.Router)();
const IS_PROD = process.env.NODE_ENV === 'production';
const TWO_FACTOR_TEMP_COOKIE = 'blindtest_2fa_tmp';
function authCookieOptions() {
    return {
        httpOnly: true,
        secure: IS_PROD,
        sameSite: (IS_PROD ? 'strict' : 'lax'),
        maxAge: 7 * 24 * 60 * 60 * 1000,
        path: '/',
    };
}
function shortCookieOptions() {
    return {
        httpOnly: true,
        secure: IS_PROD,
        sameSite: (IS_PROD ? 'strict' : 'lax'),
        maxAge: 10 * 60 * 1000,
        path: '/',
    };
}
function clearAuthCookies(res) {
    res.clearCookie('blindtest_auth', { path: '/' });
    res.clearCookie(TWO_FACTOR_TEMP_COOKIE, { path: '/' });
}
function getDbErrorMessage(err) {
    if (process.env.AUTH_DEBUG_ERRORS === 'true') {
        const code = err?.code ? ` (${err.code})` : '';
        const message = err?.message ? `: ${err.message}` : '';
        return `Erreur serveur${code}${message}`;
    }
    if (err?.code === 'ECONNREFUSED') {
        return 'Base de données indisponible. Lance MySQL puis réessaie.';
    }
    return 'Erreur serveur';
}
function getJwtSecret() {
    const secret = process.env.JWT_SECRET;
    if (!secret || secret.length < 32) {
        throw new Error('JWT_SECRET manquant ou trop court');
    }
    return secret;
}
function signTwoFactorTempToken(payload) {
    return jsonwebtoken_1.default.sign({ ...payload, purpose: '2fa-login' }, getJwtSecret(), { expiresIn: '10m' });
}
router.post('/register', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
        return res.status(400).json({ error: 'Email et mot de passe requis' });
    }
    if (password.length < 6) {
        return res.status(400).json({ error: 'Le mot de passe doit faire au moins 6 caractères' });
    }
    try {
        const [existing] = await db_js_1.default.query('SELECT id FROM users WHERE email = ?', [email]);
        if (existing.length > 0) {
            return res.status(409).json({ error: 'Cet email est déjà utilisé' });
        }
        const hash = await bcryptjs_1.default.hash(password, 12);
        const id = (0, uuid_1.v4)();
        const now = Date.now();
        await db_js_1.default.query('INSERT INTO users (id, email, password_hash, created_at, two_factor_enabled, two_factor_secret) VALUES (?, ?, ?, ?, ?, ?)', [id, email, hash, now, 0, null]);
        const token = (0, auth_js_1.signToken)({ userId: id, email });
        res.cookie('blindtest_auth', token, authCookieOptions());
        return res.status(201).json({ user: { id, email, twoFactorEnabled: false } });
    }
    catch (err) {
        console.error('Register error', err);
        return res.status(500).json({ error: getDbErrorMessage(err) });
    }
});
router.post('/login', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
        return res.status(400).json({ error: 'Email et mot de passe requis' });
    }
    try {
        const [rows] = await db_js_1.default.query('SELECT id, email, password_hash, two_factor_enabled, two_factor_secret FROM users WHERE email = ?', [email]);
        const user = rows[0];
        if (!user) {
            return res.status(401).json({ error: 'Email ou mot de passe incorrect' });
        }
        const valid = await bcryptjs_1.default.compare(password, user.password_hash);
        if (!valid) {
            return res.status(401).json({ error: 'Email ou mot de passe incorrect' });
        }
        if (user.two_factor_enabled) {
            const tempToken = signTwoFactorTempToken({ userId: user.id, email: user.email });
            res.cookie(TWO_FACTOR_TEMP_COOKIE, tempToken, shortCookieOptions());
            return res.json({ requiresTwoFactor: true });
        }
        const token = (0, auth_js_1.signToken)({ userId: user.id, email: user.email });
        res.cookie('blindtest_auth', token, authCookieOptions());
        return res.json({ user: { id: user.id, email: user.email, twoFactorEnabled: !!user.two_factor_enabled } });
    }
    catch (err) {
        console.error('Login error', err);
        return res.status(500).json({ error: getDbErrorMessage(err) });
    }
});
router.post('/login/2fa', async (req, res) => {
    const { code } = req.body;
    if (!code)
        return res.status(400).json({ error: 'Code 2FA requis' });
    try {
        const tempToken = req.cookies?.[TWO_FACTOR_TEMP_COOKIE];
        if (!tempToken)
            return res.status(401).json({ error: 'Session 2FA expirée' });
        const payload = jsonwebtoken_1.default.verify(tempToken, getJwtSecret());
        if (payload.purpose !== '2fa-login')
            return res.status(401).json({ error: 'Session 2FA invalide' });
        const [rows] = await db_js_1.default.query('SELECT id, email, two_factor_enabled, two_factor_secret FROM users WHERE id = ?', [payload.userId]);
        const user = rows[0];
        if (!user || !user.two_factor_enabled || !user.two_factor_secret) {
            return res.status(401).json({ error: '2FA non configurée' });
        }
        const valid = speakeasy_1.default.totp.verify({ token: code, secret: user.two_factor_secret, encoding: 'base32' });
        if (!valid)
            return res.status(401).json({ error: 'Code 2FA invalide' });
        const token = (0, auth_js_1.signToken)({ userId: user.id, email: user.email });
        res.cookie('blindtest_auth', token, authCookieOptions());
        res.clearCookie(TWO_FACTOR_TEMP_COOKIE, { path: '/' });
        return res.json({ user: { id: user.id, email: user.email, twoFactorEnabled: true } });
    }
    catch (err) {
        console.error('2FA login error', err);
        return res.status(500).json({ error: getDbErrorMessage(err) });
    }
});
router.get('/me', auth_js_1.requireAuth, async (req, res) => {
    try {
        const [rows] = await db_js_1.default.query('SELECT id, email, created_at, two_factor_enabled FROM users WHERE id = ?', [req.user.userId]);
        const user = rows[0];
        if (!user)
            return res.status(404).json({ error: 'Utilisateur introuvable' });
        return res.json({ user: { id: user.id, email: user.email, twoFactorEnabled: !!user.two_factor_enabled } });
    }
    catch (err) {
        console.error('Me error', err);
        return res.status(500).json({ error: getDbErrorMessage(err) });
    }
});
router.post('/logout', (_req, res) => {
    clearAuthCookies(res);
    return res.json({ success: true });
});
router.post('/2fa/setup', auth_js_1.requireAuth, async (req, res) => {
    try {
        const [rows] = await db_js_1.default.query('SELECT id, email FROM users WHERE id = ?', [req.user.userId]);
        const user = rows[0];
        if (!user)
            return res.status(404).json({ error: 'Utilisateur introuvable' });
        const generated = speakeasy_1.default.generateSecret({ name: `BlindTestLive (${user.email})` });
        if (!generated.base32 || !generated.otpauth_url) {
            return res.status(500).json({ error: 'Impossible de générer le secret 2FA' });
        }
        const secret = generated.base32;
        const otpauth = generated.otpauth_url;
        const qrCodeDataUrl = await qrcode_1.default.toDataURL(otpauth);
        await db_js_1.default.query('UPDATE users SET two_factor_secret = ?, two_factor_enabled = ? WHERE id = ?', [secret, 0, user.id]);
        return res.json({ secret, qrCodeDataUrl });
    }
    catch (err) {
        console.error('2FA setup error', err);
        return res.status(500).json({ error: getDbErrorMessage(err) });
    }
});
router.post('/2fa/enable', auth_js_1.requireAuth, async (req, res) => {
    const { code } = req.body;
    if (!code)
        return res.status(400).json({ error: 'Code 2FA requis' });
    try {
        const [rows] = await db_js_1.default.query('SELECT id, two_factor_secret FROM users WHERE id = ?', [req.user.userId]);
        const user = rows[0];
        if (!user || !user.two_factor_secret)
            return res.status(400).json({ error: 'Configuration 2FA absente' });
        const valid = speakeasy_1.default.totp.verify({ token: code, secret: user.two_factor_secret, encoding: 'base32' });
        if (!valid)
            return res.status(401).json({ error: 'Code 2FA invalide' });
        await db_js_1.default.query('UPDATE users SET two_factor_enabled = ? WHERE id = ?', [1, user.id]);
        return res.json({ success: true });
    }
    catch (err) {
        console.error('2FA enable error', err);
        return res.status(500).json({ error: getDbErrorMessage(err) });
    }
});
router.post('/2fa/disable', auth_js_1.requireAuth, async (req, res) => {
    const { code } = req.body;
    if (!code)
        return res.status(400).json({ error: 'Code 2FA requis' });
    try {
        const [rows] = await db_js_1.default.query('SELECT id, two_factor_secret, two_factor_enabled FROM users WHERE id = ?', [req.user.userId]);
        const user = rows[0];
        if (!user || !user.two_factor_enabled || !user.two_factor_secret) {
            return res.status(400).json({ error: '2FA non active' });
        }
        const valid = speakeasy_1.default.totp.verify({ token: code, secret: user.two_factor_secret, encoding: 'base32' });
        if (!valid)
            return res.status(401).json({ error: 'Code 2FA invalide' });
        await db_js_1.default.query('UPDATE users SET two_factor_enabled = ?, two_factor_secret = ? WHERE id = ?', [0, null, user.id]);
        return res.json({ success: true });
    }
    catch (err) {
        console.error('2FA disable error', err);
        return res.status(500).json({ error: getDbErrorMessage(err) });
    }
});
router.post('/password/change', auth_js_1.requireAuth, async (req, res) => {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
        return res.status(400).json({ error: 'Mot de passe actuel et nouveau mot de passe requis' });
    }
    if (newPassword.length < 8) {
        return res.status(400).json({ error: 'Le nouveau mot de passe doit contenir au moins 8 caractères' });
    }
    try {
        const [rows] = await db_js_1.default.query('SELECT id, password_hash FROM users WHERE id = ?', [req.user.userId]);
        const user = rows[0];
        if (!user)
            return res.status(404).json({ error: 'Utilisateur introuvable' });
        const valid = await bcryptjs_1.default.compare(currentPassword, user.password_hash);
        if (!valid)
            return res.status(401).json({ error: 'Mot de passe actuel incorrect' });
        const newHash = await bcryptjs_1.default.hash(newPassword, 12);
        await db_js_1.default.query('UPDATE users SET password_hash = ? WHERE id = ?', [newHash, user.id]);
        return res.json({ success: true });
    }
    catch (err) {
        console.error('Password change error', err);
        return res.status(500).json({ error: getDbErrorMessage(err) });
    }
});
exports.default = router;
