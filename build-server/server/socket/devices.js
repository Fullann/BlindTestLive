"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerDeviceHandlers = registerDeviceHandlers;
const zod_1 = require("zod");
const hardware_devices_js_1 = require("../hardware-devices.js");
const helloSchema = zod_1.z.object({
    deviceId: zod_1.z.string().min(3).max(64),
    secret: zod_1.z.string().min(6).max(200),
    name: zod_1.z.string().min(1).max(64).optional(),
    firmware: zod_1.z.string().min(1).max(32).optional(),
});
const pressSchema = zod_1.z.object({
    deviceId: zod_1.z.string().min(3).max(64),
    gameId: zod_1.z.string().min(1).max(10),
    pressedAt: zod_1.z.number().optional(),
});
const heartbeatSchema = zod_1.z.object({
    deviceId: zod_1.z.string().min(3).max(64),
    rssi: zod_1.z.number().min(-120).max(0).optional(),
});
/** Fallback secret global (utilisé uniquement si DB désactivée). */
const FALLBACK_SECRET = process.env.DEVICE_SHARED_SECRET || "blindtest-device-secret";
function ensureHardwareContainer(game) {
    if (!game.hardwareDevices) {
        game.hardwareDevices = {};
    }
}
function emitHardwareUpdate(ctx, gameId) {
    const game = ctx.activeGames[gameId];
    if (!game)
        return;
    ctx.io.to(gameId).emit("game:hardwareUpdate", game.hardwareDevices || {});
    ctx.io.to(gameId).emit("game:stateUpdate", ctx.sanitizeGameState(game));
}
function runBuzzFromDevice(ctx, gameId, playerId, callback) {
    const game = ctx.activeGames[gameId];
    if (!game)
        return callback({ success: false, error: "Partie introuvable" });
    const player = game.players[playerId];
    if (!player || player.lockedOut)
        return callback({ success: false, error: "Joueur invalide ou bloqué" });
    if (!(game.status === "playing" && !game.buzzedPlayerId)) {
        return callback({ success: false, error: "Buzz non disponible" });
    }
    player.stats = player.stats || { buzzes: 0, correctAnswers: 0, wrongAnswers: 0 };
    player.stats.buzzes += 1;
    game.status = "paused";
    game.buzzedPlayerId = playerId;
    game.buzzTimestamp = Date.now();
    game.lastActivity = Date.now();
    ctx.persistGame(game);
    ctx.io.to(gameId).emit("game:playSound", "buzz");
    ctx.io.to(gameId).emit("game:stateUpdate", ctx.sanitizeGameState(game));
    callback({ success: true });
}
function registerDeviceHandlers(ctx) {
    const { socket, activeGames, persistGame } = ctx;
    socket.on("device:hello", async (rawPayload, callback) => {
        const parsed = helloSchema.safeParse(rawPayload);
        if (!parsed.success)
            return callback?.({ success: false, error: "Payload invalide" });
        const { deviceId, secret, name, firmware } = parsed.data;
        // Vérification du secret : par DB si disponible, sinon fallback global
        if (ctx.enableDb) {
            const ownerId = await (0, hardware_devices_js_1.verifyDeviceSecret)(deviceId, secret).catch(() => null);
            if (!ownerId) {
                return callback?.({ success: false, error: "Secret matériel invalide ou device non enregistré" });
            }
            socket.data.ownerId = ownerId;
            if (firmware)
                (0, hardware_devices_js_1.updateFirmware)(deviceId, firmware).catch(() => { });
        }
        else {
            if (secret !== FALLBACK_SECRET) {
                return callback?.({ success: false, error: "Secret matériel invalide" });
            }
        }
        ctx.connectedDeviceSockets.set(deviceId, socket.id);
        socket.data.deviceId = deviceId;
        socket.join(`device:${deviceId}`);
        callback?.({ success: true, deviceId });
        Object.values(activeGames).forEach((game) => {
            ensureHardwareContainer(game);
            const existing = game.hardwareDevices?.[deviceId];
            if (!existing)
                return;
            game.hardwareDevices[deviceId] = {
                ...existing,
                name: name || existing.name || deviceId,
                firmware: firmware || existing.firmware,
                status: "online",
                lastSeenAt: Date.now(),
                speakerEnabled: existing.speakerEnabled ?? true,
                speakerMuted: existing.speakerMuted ?? false,
                sensitivity: existing.sensitivity ?? 5,
                ledStyle: existing.ledStyle ?? "classic",
                soundStyle: existing.soundStyle ?? "default",
            };
            persistGame(game);
            emitHardwareUpdate(ctx, game.id);
        });
    });
    socket.on("device:heartbeat", (rawPayload) => {
        const parsed = heartbeatSchema.safeParse(rawPayload);
        if (!parsed.success)
            return;
        const { deviceId, rssi } = parsed.data;
        // Vérification : seul le socket qui s'est authentifié avec ce deviceId peut envoyer son heartbeat
        if (!socket.data.deviceId || socket.data.deviceId !== deviceId)
            return;
        Object.values(activeGames).forEach((game) => {
            if (!game.hardwareDevices?.[deviceId])
                return;
            game.hardwareDevices[deviceId].status = "online";
            game.hardwareDevices[deviceId].lastSeenAt = Date.now();
            if (typeof rssi === "number")
                game.hardwareDevices[deviceId].rssi = rssi;
            persistGame(game);
            emitHardwareUpdate(ctx, game.id);
        });
    });
    socket.on("buzzer:press", (rawPayload, callback) => {
        const parsed = pressSchema.safeParse(rawPayload);
        if (!parsed.success)
            return callback?.({ success: false, error: "Payload invalide" });
        const { deviceId, gameId } = parsed.data;
        // Vérification : le socket doit être authentifié et correspondre au deviceId déclaré
        if (!socket.data.deviceId || socket.data.deviceId !== deviceId) {
            return callback?.({ success: false, error: "Identité du buzzer non vérifiée" });
        }
        const game = activeGames[gameId];
        if (!game)
            return callback?.({ success: false, error: "Partie introuvable" });
        const player = Object.values(game.players).find((p) => p.buzzerDeviceId === deviceId);
        if (!player)
            return callback?.({ success: false, error: "Buzzer non assigné" });
        runBuzzFromDevice(ctx, gameId, player.id, callback || (() => { }));
    });
    socket.on("disconnect", () => {
        const deviceId = socket.data.deviceId;
        if (!deviceId)
            return;
        ctx.connectedDeviceSockets.delete(deviceId);
        Object.values(activeGames).forEach((game) => {
            if (!game.hardwareDevices?.[deviceId])
                return;
            game.hardwareDevices[deviceId].status = "offline";
            game.hardwareDevices[deviceId].lastSeenAt = Date.now();
            persistGame(game);
            emitHardwareUpdate(ctx, game.id);
        });
    });
}
