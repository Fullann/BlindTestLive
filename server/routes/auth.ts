import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import jwt from 'jsonwebtoken';
import speakeasy from 'speakeasy';
import QRCode from 'qrcode';
import pool from '../db.js';
import { requireAuth, signToken } from '../middleware/auth.js';

const router = Router();
const IS_PROD = process.env.NODE_ENV === 'production';
const TWO_FACTOR_TEMP_COOKIE = 'blindtest_2fa_tmp';

function authCookieOptions() {
  return {
    httpOnly: true,
    secure: IS_PROD,
    sameSite: (IS_PROD ? 'strict' : 'lax') as 'strict' | 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/',
  };
}

function shortCookieOptions() {
  return {
    httpOnly: true,
    secure: IS_PROD,
    sameSite: (IS_PROD ? 'strict' : 'lax') as 'strict' | 'lax',
    maxAge: 10 * 60 * 1000,
    path: '/',
  };
}

function clearAuthCookies(res: Response) {
  res.clearCookie('blindtest_auth', { path: '/' });
  res.clearCookie(TWO_FACTOR_TEMP_COOKIE, { path: '/' });
}

function getDbErrorMessage(err: any): string {
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

function signTwoFactorTempToken(payload: { userId: string; email: string }) {
  return jwt.sign({ ...payload, purpose: '2fa-login' }, getJwtSecret(), { expiresIn: '10m' });
}

router.post('/register', async (req: Request, res: Response) => {
  const { email, password } = req.body as { email?: string; password?: string };
  if (!email || !password) {
    return res.status(400).json({ error: 'Email et mot de passe requis' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Le mot de passe doit faire au moins 6 caractères' });
  }
  try {
    const [existing] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
    if ((existing as any[]).length > 0) {
      return res.status(409).json({ error: 'Cet email est déjà utilisé' });
    }
    const hash = await bcrypt.hash(password, 12);
    const id = uuidv4();
    const now = Date.now();
    await pool.query(
      'INSERT INTO users (id, email, password_hash, created_at, two_factor_enabled, two_factor_secret) VALUES (?, ?, ?, ?, ?, ?)',
      [id, email, hash, now, 0, null],
    );
    const token = signToken({ userId: id, email });
    res.cookie('blindtest_auth', token, authCookieOptions());
    return res.status(201).json({ user: { id, email, twoFactorEnabled: false } });
  } catch (err) {
    console.error('Register error', err);
    return res.status(500).json({ error: getDbErrorMessage(err) });
  }
});

router.post('/login', async (req: Request, res: Response) => {
  const { email, password } = req.body as { email?: string; password?: string };
  if (!email || !password) {
    return res.status(400).json({ error: 'Email et mot de passe requis' });
  }
  try {
    const [rows] = await pool.query(
      'SELECT id, email, password_hash, two_factor_enabled, two_factor_secret FROM users WHERE email = ?',
      [email],
    );
    const user = (rows as any[])[0];
    if (!user) {
      return res.status(401).json({ error: 'Email ou mot de passe incorrect' });
    }
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Email ou mot de passe incorrect' });
    }
    if (user.two_factor_enabled) {
      const tempToken = signTwoFactorTempToken({ userId: user.id, email: user.email });
      res.cookie(TWO_FACTOR_TEMP_COOKIE, tempToken, shortCookieOptions());
      return res.json({ requiresTwoFactor: true });
    }

    const token = signToken({ userId: user.id, email: user.email });
    res.cookie('blindtest_auth', token, authCookieOptions());
    return res.json({ user: { id: user.id, email: user.email, twoFactorEnabled: !!user.two_factor_enabled } });
  } catch (err) {
    console.error('Login error', err);
    return res.status(500).json({ error: getDbErrorMessage(err) });
  }
});

router.post('/login/2fa', async (req: Request, res: Response) => {
  const { code } = req.body as { code?: string };
  if (!code) return res.status(400).json({ error: 'Code 2FA requis' });

  try {
    const tempToken = req.cookies?.[TWO_FACTOR_TEMP_COOKIE];
    if (!tempToken) return res.status(401).json({ error: 'Session 2FA expirée' });
    const payload = jwt.verify(tempToken, getJwtSecret()) as { userId: string; email: string; purpose?: string };
    if (payload.purpose !== '2fa-login') return res.status(401).json({ error: 'Session 2FA invalide' });

    const [rows] = await pool.query(
      'SELECT id, email, two_factor_enabled, two_factor_secret FROM users WHERE id = ?',
      [payload.userId],
    );
    const user = (rows as any[])[0];
    if (!user || !user.two_factor_enabled || !user.two_factor_secret) {
      return res.status(401).json({ error: '2FA non configurée' });
    }

    const valid = speakeasy.totp.verify({ token: code, secret: user.two_factor_secret, encoding: 'base32' });
    if (!valid) return res.status(401).json({ error: 'Code 2FA invalide' });

    const token = signToken({ userId: user.id, email: user.email });
    res.cookie('blindtest_auth', token, authCookieOptions());
    res.clearCookie(TWO_FACTOR_TEMP_COOKIE, { path: '/' });
    return res.json({ user: { id: user.id, email: user.email, twoFactorEnabled: true } });
  } catch (err) {
    console.error('2FA login error', err);
    return res.status(500).json({ error: getDbErrorMessage(err) });
  }
});

router.get('/me', requireAuth, async (req: Request, res: Response) => {
  try {
    const [rows] = await pool.query('SELECT id, email, created_at, two_factor_enabled FROM users WHERE id = ?', [req.user!.userId]);
    const user = (rows as any[])[0];
    if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });
    return res.json({ user: { id: user.id, email: user.email, twoFactorEnabled: !!user.two_factor_enabled } });
  } catch (err) {
    console.error('Me error', err);
    return res.status(500).json({ error: getDbErrorMessage(err) });
  }
});

router.post('/logout', (_req: Request, res: Response) => {
  clearAuthCookies(res);
  return res.json({ success: true });
});

router.post('/2fa/setup', requireAuth, async (req: Request, res: Response) => {
  try {
    const [rows] = await pool.query('SELECT id, email FROM users WHERE id = ?', [req.user!.userId]);
    const user = (rows as any[])[0];
    if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });

    const generated = speakeasy.generateSecret({ name: `BlindTestLive (${user.email})` });
    if (!generated.base32 || !generated.otpauth_url) {
      return res.status(500).json({ error: 'Impossible de générer le secret 2FA' });
    }
    const secret = generated.base32;
    const otpauth = generated.otpauth_url;
    const qrCodeDataUrl = await QRCode.toDataURL(otpauth);
    await pool.query('UPDATE users SET two_factor_secret = ?, two_factor_enabled = ? WHERE id = ?', [secret, 0, user.id]);
    return res.json({ secret, qrCodeDataUrl });
  } catch (err) {
    console.error('2FA setup error', err);
    return res.status(500).json({ error: getDbErrorMessage(err) });
  }
});

router.post('/2fa/enable', requireAuth, async (req: Request, res: Response) => {
  const { code } = req.body as { code?: string };
  if (!code) return res.status(400).json({ error: 'Code 2FA requis' });
  try {
    const [rows] = await pool.query('SELECT id, two_factor_secret FROM users WHERE id = ?', [req.user!.userId]);
    const user = (rows as any[])[0];
    if (!user || !user.two_factor_secret) return res.status(400).json({ error: 'Configuration 2FA absente' });

    const valid = speakeasy.totp.verify({ token: code, secret: user.two_factor_secret, encoding: 'base32' });
    if (!valid) return res.status(401).json({ error: 'Code 2FA invalide' });

    await pool.query('UPDATE users SET two_factor_enabled = ? WHERE id = ?', [1, user.id]);
    return res.json({ success: true });
  } catch (err) {
    console.error('2FA enable error', err);
    return res.status(500).json({ error: getDbErrorMessage(err) });
  }
});

router.post('/2fa/disable', requireAuth, async (req: Request, res: Response) => {
  const { code } = req.body as { code?: string };
  if (!code) return res.status(400).json({ error: 'Code 2FA requis' });
  try {
    const [rows] = await pool.query('SELECT id, two_factor_secret, two_factor_enabled FROM users WHERE id = ?', [req.user!.userId]);
    const user = (rows as any[])[0];
    if (!user || !user.two_factor_enabled || !user.two_factor_secret) {
      return res.status(400).json({ error: '2FA non active' });
    }
    const valid = speakeasy.totp.verify({ token: code, secret: user.two_factor_secret, encoding: 'base32' });
    if (!valid) return res.status(401).json({ error: 'Code 2FA invalide' });

    await pool.query('UPDATE users SET two_factor_enabled = ?, two_factor_secret = ? WHERE id = ?', [0, null, user.id]);
    return res.json({ success: true });
  } catch (err) {
    console.error('2FA disable error', err);
    return res.status(500).json({ error: getDbErrorMessage(err) });
  }
});

router.post('/password/change', requireAuth, async (req: Request, res: Response) => {
  const { currentPassword, newPassword } = req.body as { currentPassword?: string; newPassword?: string };
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Mot de passe actuel et nouveau mot de passe requis' });
  }
  if (newPassword.length < 8) {
    return res.status(400).json({ error: 'Le nouveau mot de passe doit contenir au moins 8 caractères' });
  }

  try {
    const [rows] = await pool.query('SELECT id, password_hash FROM users WHERE id = ?', [req.user!.userId]);
    const user = (rows as any[])[0];
    if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });

    const valid = await bcrypt.compare(currentPassword, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Mot de passe actuel incorrect' });

    const newHash = await bcrypt.hash(newPassword, 12);
    await pool.query('UPDATE users SET password_hash = ? WHERE id = ?', [newHash, user.id]);
    return res.json({ success: true });
  } catch (err) {
    console.error('Password change error', err);
    return res.status(500).json({ error: getDbErrorMessage(err) });
  }
});

export default router;
