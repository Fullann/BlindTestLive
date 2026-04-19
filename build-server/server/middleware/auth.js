"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireAuth = requireAuth;
exports.signToken = signToken;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
function getJwtSecret() {
    const secret = process.env.JWT_SECRET;
    if (!secret || secret.length < 32) {
        throw new Error('JWT_SECRET manquant ou trop court (min 32 caractères)');
    }
    return secret;
}
function requireAuth(req, res, next) {
    const authHeader = req.headers.authorization;
    const bearerToken = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    const cookieToken = req.cookies?.blindtest_auth;
    const token = bearerToken || cookieToken;
    if (!token) {
        return res.status(401).json({ error: 'Token manquant' });
    }
    let secret;
    try {
        secret = getJwtSecret();
    }
    catch (error) {
        console.error(error);
        return res.status(500).json({ error: 'Configuration JWT invalide' });
    }
    try {
        const payload = jsonwebtoken_1.default.verify(token, secret, { algorithms: ['HS256'] });
        req.user = payload;
        return next();
    }
    catch {
        return res.status(401).json({ error: 'Token invalide ou expiré' });
    }
}
function signToken(payload) {
    const secret = getJwtSecret();
    return jsonwebtoken_1.default.sign(payload, secret, { algorithm: 'HS256', expiresIn: '7d' });
}
