"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const promise_1 = __importDefault(require("mysql2/promise"));
const dbPassword = process.env.DB_PASSWORD;
if (!dbPassword && process.env.NODE_ENV === 'production') {
    throw new Error('DB_PASSWORD est requis en production. Vérifiez votre fichier .env.');
}
const pool = promise_1.default.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 3306,
    database: process.env.DB_NAME || 'blindtest',
    user: process.env.DB_USER || 'blindtest',
    password: dbPassword || 'secret',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    timezone: '+00:00',
});
let schemaChecked = false;
async function ensureTwoFactorColumns() {
    if (schemaChecked)
        return;
    try {
        const dbName = process.env.DB_NAME || 'blindtest';
        const [rows] = await pool.query(`SELECT COLUMN_NAME
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = ?
         AND TABLE_NAME = 'users'
         AND COLUMN_NAME IN ('two_factor_enabled', 'two_factor_secret')`, [dbName]);
        const names = new Set(rows.map((r) => r.COLUMN_NAME));
        if (!names.has('two_factor_enabled')) {
            await pool.query("ALTER TABLE users ADD COLUMN two_factor_enabled TINYINT(1) NOT NULL DEFAULT 0");
        }
        if (!names.has('two_factor_secret')) {
            await pool.query("ALTER TABLE users ADD COLUMN two_factor_secret VARCHAR(255) DEFAULT NULL");
        }
        schemaChecked = true;
    }
    catch (error) {
        // Keep running even if DB is not reachable at startup.
        console.warn('DB schema check skipped:', error);
    }
}
void ensureTwoFactorColumns();
exports.default = pool;
