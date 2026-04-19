"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerGameStateHandlers = registerGameStateHandlers;
const zod_1 = require("zod");
const gameIdSchema = zod_1.z.string().min(1).max(10);
const requestStateSchema = zod_1.z.object({
    gameId: zod_1.z.string().min(1).max(10),
    playerId: zod_1.z.string().min(1).max(100).optional(),
    playerSecret: zod_1.z.string().min(1).max(200).optional(),
    hostToken: zod_1.z.string().min(1).max(200).optional(),
    asScreen: zod_1.z.boolean().optional(),
});
function registerGameStateHandlers(ctx) {
    const { socket, activeGames, getHostRole, sanitizeGameState } = ctx;
    socket.on("game:check", (gameId, callback) => {
        const gameIdResult = gameIdSchema.safeParse(gameId);
        if (!gameIdResult.success) {
            return callback({ success: false, error: "Code invalide" });
        }
        const safeGameId = gameIdResult.data;
        const game = activeGames[safeGameId];
        if (!game) {
            return callback({ success: false, error: "Partie introuvable" });
        }
        callback({
            success: true,
            status: game.status,
            isTeamMode: game.isTeamMode,
            enableBonuses: game.enableBonuses ?? true,
            teamConfig: game.teamConfig || [],
        });
    });
    socket.on("game:requestState", (rawPayload, callback) => {
        const parsed = requestStateSchema.safeParse(rawPayload);
        if (!parsed.success)
            return callback({ success: false, error: "Payload invalide" });
        const { gameId, hostToken, playerId, playerSecret, asScreen } = parsed.data;
        const game = activeGames[gameId];
        if (!game)
            return callback({ success: false, error: "Game not found" });
        if (asScreen)
            return callback({ success: true, state: sanitizeGameState(game) });
        if (hostToken) {
            const role = getHostRole(game, hostToken);
            if (!role)
                return callback({ success: false, error: "Unauthorized" });
            return callback({ success: true, state: sanitizeGameState(game), role });
        }
        if (playerId && game.players[playerId]) {
            if (game.players[playerId].playerSecret !== playerSecret) {
                return callback({ success: false, error: "Unauthorized" });
            }
            return callback({ success: true, state: sanitizeGameState(game) });
        }
        return callback({ success: false, error: "Unauthorized" });
    });
}
