/**
 * server/hardware-devices.ts
 * Module partagé entre les routes HTTP et les handlers Socket.IO
 * pour la gestion des totems ESP32 avec secrets individuels.
 */
import crypto from "crypto";
import pool from "./db.js";

let schemaReady = false;

/* ─── Schéma DB ──────────────────────────────────────────── */

export async function ensureHardwareSchema() {
  if (schemaReady) return;
  await pool.query(`
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

/* ─── Types ──────────────────────────────────────────────── */

export interface HardwareDeviceRecord {
  device_id:  string;
  owner_id:   string;
  secret:     string;
  name:       string;
  firmware:   string;
  created_at: number;
}

/* ─── Helpers ────────────────────────────────────────────── */

/** Génère un secret cryptographiquement fort (64 hex chars). */
export function generateDeviceSecret(): string {
  return crypto.randomBytes(32).toString("hex");
}

/**
 * Enregistre (ou re-claim) un device pour un propriétaire.
 * Si le deviceId existe déjà et appartient au même owner → met à jour le nom.
 * Si le deviceId appartient à un autre owner → erreur.
 * Sinon → crée et retourne le nouveau secret.
 */
export async function claimDevice(
  deviceId: string,
  ownerId: string,
  name: string,
): Promise<{ secret: string; isNew: boolean }> {
  await ensureHardwareSchema();

  const [rows] = await pool.query<any[]>(
    "SELECT owner_id, secret FROM hardware_devices WHERE device_id = ?",
    [deviceId],
  );

  if (rows.length > 0) {
    const row = rows[0];
    if (row.owner_id !== ownerId) {
      throw new Error("Ce deviceId appartient déjà à un autre compte.");
    }
    // Même propriétaire : mise à jour du nom uniquement, secret inchangé
    await pool.query(
      "UPDATE hardware_devices SET name = ? WHERE device_id = ?",
      [name, deviceId],
    );
    return { secret: row.secret, isNew: false };
  }

  const secret = generateDeviceSecret();
  await pool.query(
    "INSERT INTO hardware_devices (device_id, owner_id, secret, name, created_at) VALUES (?, ?, ?, ?, ?)",
    [deviceId, ownerId, secret, name, Date.now()],
  );
  return { secret, isNew: true };
}

/** Liste tous les devices d'un admin. */
export async function listDevices(ownerId: string): Promise<HardwareDeviceRecord[]> {
  await ensureHardwareSchema();
  const [rows] = await pool.query<any[]>(
    "SELECT device_id, owner_id, secret, name, firmware, created_at FROM hardware_devices WHERE owner_id = ? ORDER BY created_at DESC",
    [ownerId],
  );
  return rows as HardwareDeviceRecord[];
}

/** Supprime un device (uniquement si appartient à cet owner). */
export async function deleteDevice(deviceId: string, ownerId: string): Promise<boolean> {
  await ensureHardwareSchema();
  const [result] = await pool.query<any>(
    "DELETE FROM hardware_devices WHERE device_id = ? AND owner_id = ?",
    [deviceId, ownerId],
  );
  return result.affectedRows > 0;
}

/** Met à jour le firmware d'un device lors d'un `device:hello`. */
export async function updateFirmware(deviceId: string, firmware: string): Promise<void> {
  await ensureHardwareSchema();
  await pool.query(
    "UPDATE hardware_devices SET firmware = ? WHERE device_id = ?",
    [firmware, deviceId],
  );
}

/**
 * Vérifie qu'un couple (deviceId, secret) est valide.
 * Retourne l'ownerId si OK, null sinon.
 */
export async function verifyDeviceSecret(
  deviceId: string,
  secret: string,
): Promise<string | null> {
  await ensureHardwareSchema();
  const [rows] = await pool.query<any[]>(
    "SELECT owner_id FROM hardware_devices WHERE device_id = ? AND secret = ?",
    [deviceId, secret],
  );
  return rows.length > 0 ? rows[0].owner_id : null;
}
