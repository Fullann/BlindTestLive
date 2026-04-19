"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ensureHardwareSchema = ensureHardwareSchema;
exports.generateDeviceSecret = generateDeviceSecret;
exports.claimDevice = claimDevice;
exports.listDevices = listDevices;
exports.deleteDevice = deleteDevice;
exports.updateFirmware = updateFirmware;
exports.verifyDeviceSecret = verifyDeviceSecret;
/**
 * server/hardware-devices.ts
 * Module partagé entre les routes HTTP et les handlers Socket.IO
 * pour la gestion des totems ESP32 avec secrets individuels.
 */
const crypto_1 = __importDefault(require("crypto"));
const db_js_1 = __importDefault(require("./db.js"));
let schemaReady = false;
/* ─── Schéma DB ──────────────────────────────────────────── */
async function ensureHardwareSchema() {
    if (schemaReady)
        return;
    await db_js_1.default.query(`
    CREATE TABLE IF NOT EXISTS hardware_devices (
      device_id   VARCHAR(64)  NOT NULL PRIMARY KEY,
      owner_id    VARCHAR(36)  NOT NULL,
      secret      VARCHAR(128) NOT NULL,
      name        VARCHAR(64)  NOT NULL DEFAULT '',
      firmware    VARCHAR(32)  NOT NULL DEFAULT '',
      created_at  BIGINT       NOT NULL,
      INDEX idx_hw_owner (owner_id)
    )
  `);
    schemaReady = true;
}
/* ─── Helpers ────────────────────────────────────────────── */
/** Génère un secret cryptographiquement fort (64 hex chars). */
function generateDeviceSecret() {
    return crypto_1.default.randomBytes(32).toString("hex");
}
/**
 * Enregistre (ou re-claim) un device pour un propriétaire.
 * Si le deviceId existe déjà et appartient au même owner → met à jour le nom.
 * Si le deviceId appartient à un autre owner → erreur.
 * Sinon → crée et retourne le nouveau secret.
 */
async function claimDevice(deviceId, ownerId, name) {
    await ensureHardwareSchema();
    const [rows] = await db_js_1.default.query("SELECT owner_id, secret FROM hardware_devices WHERE device_id = ?", [deviceId]);
    if (rows.length > 0) {
        const row = rows[0];
        if (row.owner_id !== ownerId) {
            throw new Error("Ce deviceId appartient déjà à un autre compte.");
        }
        // Même propriétaire : mise à jour du nom uniquement, secret inchangé
        await db_js_1.default.query("UPDATE hardware_devices SET name = ? WHERE device_id = ?", [name, deviceId]);
        return { secret: row.secret, isNew: false };
    }
    const secret = generateDeviceSecret();
    await db_js_1.default.query("INSERT INTO hardware_devices (device_id, owner_id, secret, name, created_at) VALUES (?, ?, ?, ?, ?)", [deviceId, ownerId, secret, name, Date.now()]);
    return { secret, isNew: true };
}
/** Liste tous les devices d'un admin. */
async function listDevices(ownerId) {
    await ensureHardwareSchema();
    const [rows] = await db_js_1.default.query("SELECT device_id, owner_id, secret, name, firmware, created_at FROM hardware_devices WHERE owner_id = ? ORDER BY created_at DESC", [ownerId]);
    return rows;
}
/** Supprime un device (uniquement si appartient à cet owner). */
async function deleteDevice(deviceId, ownerId) {
    await ensureHardwareSchema();
    const [result] = await db_js_1.default.query("DELETE FROM hardware_devices WHERE device_id = ? AND owner_id = ?", [deviceId, ownerId]);
    return result.affectedRows > 0;
}
/** Met à jour le firmware d'un device lors d'un `device:hello`. */
async function updateFirmware(deviceId, firmware) {
    await ensureHardwareSchema();
    await db_js_1.default.query("UPDATE hardware_devices SET firmware = ? WHERE device_id = ?", [firmware, deviceId]);
}
/**
 * Vérifie qu'un couple (deviceId, secret) est valide.
 * Retourne l'ownerId si OK, null sinon.
 */
async function verifyDeviceSecret(deviceId, secret) {
    await ensureHardwareSchema();
    const [rows] = await db_js_1.default.query("SELECT owner_id FROM hardware_devices WHERE device_id = ? AND secret = ?", [deviceId, secret]);
    return rows.length > 0 ? rows[0].owner_id : null;
}
