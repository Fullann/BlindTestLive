import { z } from "zod";
import { Ack, SocketHandlerContext } from "./context";

const gameIdSchema = z.string().min(1).max(10);
const requestStateSchema = z.object({
  gameId: z.string().min(1).max(10),
  playerId: z.string().min(1).max(100).optional(),
  playerSecret: z.string().min(1).max(200).optional(),
  hostToken: z.string().min(1).max(200).optional(),
  asScreen: z.boolean().optional(),
});

export function registerGameStateHandlers(ctx: SocketHandlerContext) {
  const { socket, activeGames, getHostRole, sanitizeGameState } = ctx;

  socket.on("game:check", (gameId, callback: Ack) => {
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

  socket.on("game:requestState", (rawPayload, callback: Ack) => {
    const parsed = requestStateSchema.safeParse(rawPayload);
    if (!parsed.success) return callback({ success: false, error: "Payload invalide" });
    const { gameId, hostToken, playerId, playerSecret, asScreen } = parsed.data;
    const game = activeGames[gameId];
    if (!game) return callback({ success: false, error: "Game not found" });

    if (asScreen) return callback({ success: true, state: sanitizeGameState(game) });

    if (hostToken) {
      const role = getHostRole(game, hostToken);
      if (!role) return callback({ success: false, error: "Unauthorized" });
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
