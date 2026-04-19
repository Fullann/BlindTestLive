import { z } from "zod";
import { Ack, SocketHandlerContext } from "./context";

const gameIdSchema = z.string().min(1).max(10);

export function registerScreenHandlers(ctx: SocketHandlerContext) {
  const { socket, activeGames, sanitizeGameState } = ctx;

  socket.on("screen:joinGame", (gameId, callback: Ack) => {
    const gameIdResult = gameIdSchema.safeParse(gameId);
    if (!gameIdResult.success) return callback({ success: false, error: "Code invalide" });
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
