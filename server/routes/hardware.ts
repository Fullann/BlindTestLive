import { Router, Request, Response } from "express";
import { requireAuth } from "../middleware/auth.js";
import {
  claimDevice,
  listDevices,
  deleteDevice,
} from "../hardware-devices.js";

const router = Router();

/* ─── GET /api/hardware/provision-config ─────────────────────
   Retourne host + port du serveur pour pré-remplir le formulaire.
   Le secret est généré côté serveur lors du claim (POST /devices).
 ──────────────────────────────────────────────────────────── */
router.get(
  "/provision-config",
  requireAuth,
  (req: Request, res: Response) => {
    const host =
      (req.headers["x-forwarded-host"] as string) ||
      (req.headers["host"] as string) ||
      "localhost";
    const hostOnly = host.split(":")[0];
    const port = Number(process.env.PORT || 5174);
    res.json({ serverHost: hostOnly, serverPort: port });
  },
);

/* ─── POST /api/hardware/devices ─────────────────────────────
   Enregistre (ou re-claim) un totem pour l'admin connecté.
   Body : { deviceId: string, name: string }
   Retourne le secret unique du totem (à envoyer via USB).
 ──────────────────────────────────────────────────────────── */
router.post(
  "/devices",
  requireAuth,
  async (req: Request, res: Response) => {
    const { deviceId, name } = req.body ?? {};
    if (!deviceId || typeof deviceId !== "string" || deviceId.length < 3) {
      return res.status(400).json({ error: "deviceId invalide (min 3 chars)" });
    }
    const deviceName = (typeof name === "string" && name.trim()) || deviceId;
    const ownerId = req.user!.userId;

    try {
      const { secret, isNew } = await claimDevice(deviceId.trim(), ownerId, deviceName.trim());
      return res.json({ success: true, deviceId: deviceId.trim(), secret, isNew });
    } catch (err: any) {
      return res.status(409).json({ error: err?.message ?? "Erreur claim device" });
    }
  },
);

/* ─── GET /api/hardware/devices ─────────────────────────────
   Liste les totems appartenant à l'admin connecté.
 ──────────────────────────────────────────────────────────── */
router.get(
  "/devices",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const devices = await listDevices(req.user!.userId);
      // On ne renvoie pas le secret dans la liste (sécurité)
      return res.json({
        devices: devices.map((d) => ({
          deviceId:  d.device_id,
          name:      d.name,
          firmware:  d.firmware,
          createdAt: d.created_at,
        })),
      });
    } catch {
      return res.status(500).json({ error: "Erreur serveur" });
    }
  },
);

/* ─── DELETE /api/hardware/devices/:deviceId ─────────────────
   Supprime un totem de l'inventaire de l'admin.
 ──────────────────────────────────────────────────────────── */
router.delete(
  "/devices/:deviceId",
  requireAuth,
  async (req: Request, res: Response) => {
    const { deviceId } = req.params;
    try {
      const ok = await deleteDevice(deviceId, req.user!.userId);
      if (!ok) return res.status(404).json({ error: "Device non trouvé ou non autorisé" });
      return res.json({ success: true });
    } catch {
      return res.status(500).json({ error: "Erreur serveur" });
    }
  },
);

export default router;
