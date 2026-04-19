"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerScreenHandlers = registerScreenHandlers;
const zod_1 = require("zod");
const gameIdSchema = zod_1.z.string().min(1).max(10);
function registerScreenHandlers(ctx) {
    const { socket, activeGames, sanitizeGameState } = ctx;
    socket.on("screen:joinGame", (gameId, callback) => {
        const gameIdResult = gameIdSchema.safeParse(gameId);
        if (!gameIdResult.success)
            return callback({ success: false, error: "Code invalide" });
        const safeGameId = gameIdResult.data;
        const game = activeGames[safeGameId];
        if (!game) {
            return callback({ success: false, error: "Game not found" });
        }
        socket.join(safeGameId);
        callback({ success: true });
        socket.emit("game:stateUpdate", sanitizeGameState(game));
    });
}
