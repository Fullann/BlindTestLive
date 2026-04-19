import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export interface AuthPayload {
  userId: string;
  email: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthPayload;
    }
  }
}

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('JWT_SECRET manquant ou trop court (min 32 caractères)');
  }
  return secret;
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  const bearerToken = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const cookieToken = req.cookies?.blindtest_auth;
  const token = bearerToken || cookieToken;
  if (!token) {
    return res.status(401).json({ error: 'Token manquant' });
  }
  let secret: string;
  try {
    secret = getJwtSecret();
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Configuration JWT invalide' });
  }

  try {
    const payload = jwt.verify(token, secret, { algorithms: ['HS256'] }) as AuthPayload;
    req.user = payload;
    return next();
  } catch {
    return res.status(401).json({ error: 'Token invalide ou expiré' });
  }
}

export function signToken(payload: AuthPayload): string {
  const secret = getJwtSecret();
  return jwt.sign(payload, secret, { algorithm: 'HS256', expiresIn: '7d' });
}
