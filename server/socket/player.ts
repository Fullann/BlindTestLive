import crypto from "crypto";
import { z } from "zod";
import { Player } from "../../src/types";
import { Ack, SocketHandlerContext } from "./context";

const playerJoinSchema = z.object({
  gameId: z.string().min(1).max(10),
  playerId: z.string().min(1).max(100).optional(),
  playerSecret: z.string().min(1).max(200).optional(),
  name: z.string().min(1).max(20),
  team: z.string().min(1).max(32).optional(),
});

export function registerPlayerHandlers(ctx: SocketHandlerContext) {
  const {
    socket,
    socketIp,
    activeGames,
    persistGame,
    sanitizeGameState,
    getRandomColor,
    buzzRateLimitsBySocket,
    buzzRateLimitsByIp,
  } = ctx;
  const buzzAttemptsByPlayer = new Map<string, number[]>();

  const pushGameLog = (gameId: string, type: string, message: string) => {
    const game = activeGames[gameId];
    if (!game) return;
    if (!game.eventLogs) game.eventLogs = [];
    game.eventLogs.unshift({ ts: Date.now(), type, message });
    game.eventLogs = game.eventLogs.slice(0, 100);
    ctx.io.to(gameId).emit("game:eventLogs", game.eventLogs);
  };

  socket.on("player:joinGame", (rawPayload, callback: Ack) => {
    const parsed = playerJoinSchema.safeParse(rawPayload);
    if (!parsed.success) {
      return callback({ success: false, error: "Payload joueur invalide" });
    }
    const { gameId, playerId, playerSecret, name, team } = parsed.data;
    const game = activeGames[gameId];
    if (!game) {
      return callback({ success: false, error: "Game not found" });
    }

    const sanitizedName = name.trim().substring(0, 20);
    let sanitizedTeam = undefined;
    if (game.isTeamMode && team) {
      const enabledTeamIds = (game.teamConfig || [])
        .filter((cfg) => cfg.enabled)
        .map((cfg) => cfg.id);
      if (enabledTeamIds.includes(team)) {
        sanitizedTeam = team;
      }
    }

    if (playerId && game.players[playerId]) {
      if (game.players[playerId].playerSecret !== playerSecret) {
        return callback({ success: false, error: "Non autorisé" });
      }

      game.players[playerId].socketId = socket.id;
      game.players[playerId].name = sanitizedName;
      if (sanitizedTeam) game.players[playerId].team = sanitizedTeam;
      game.players[playerId].stats = game.players[playerId].stats || { buzzes: 0, correctAnswers: 0, wrongAnswers: 0 };
      game.players[playerId].deviceType = game.players[playerId].buzzerDeviceId ? "esp32" : "mobile";

      socket.join(gameId);
      game.lastActivity = Date.now();
      persistGame(game);
      callback({ success: true, player: game.players[playerId] });
      ctx.io.to(gameId).emit("game:stateUpdate", sanitizeGameState(game));
      return;
    }

    const newPlayerId = playerId || socket.id;
    const newPlayer: Player = {
      id: newPlayerId,
      socketId: socket.id,
      name: sanitizedName,
      color: getRandomColor(),
      score: 0,
      lockedOut: false,
      team: sanitizedTeam,
      playerSecret: playerSecret || crypto.randomUUID(),
      combo: 0,
      jokers: game.enableBonuses ? { doublePoints: true, stealPoints: true, skipRound: true } : { doublePoints: false, stealPoints: false, skipRound: false },
      stats: { buzzes: 0, correctAnswers: 0, wrongAnswers: 0 },
      deviceType: "mobile",
    };

    game.players[newPlayerId] = newPlayer;
    game.lastActivity = Date.now();
    persistGame(game);
    socket.join(gameId);
    callback({ success: true, player: newPlayer });
    pushGameLog(gameId, "player_join", `${newPlayer.name} rejoint la partie`);
    ctx.io.to(gameId).emit("game:stateUpdate", sanitizeGameState(game));
  });

  socket.on("player:buzz", ({ gameId, playerId }, callback: Ack) => {
    const now = Date.now();
    const lastBuzz = buzzRateLimitsBySocket.get(socket.id) || 0;
    const lastBuzzIp = buzzRateLimitsByIp.get(socketIp) || 0;
    if (now - lastBuzz < 500) {
      return callback({ success: false, error: "Trop de buzz" });
    }
    if (now - lastBuzzIp < 250) {
      return callback({ success: false, error: "Trop de buzz (IP)" });
    }
    buzzRateLimitsBySocket.set(socket.id, now);
    buzzRateLimitsByIp.set(socketIp, now);

    const game = activeGames[gameId];
    if (!game) return callback({ success: false, error: "Game not found" });

    const player = game.players[playerId];
    if (!player || player.lockedOut || player.socketId !== socket.id) {
      return callback({ success: false, error: "Buzz refusé" });
    }

    const attemptHistory = buzzAttemptsByPlayer.get(playerId) || [];
    const recentAttempts = attemptHistory.filter((ts) => now - ts < 10_000);
    recentAttempts.push(now);
    buzzAttemptsByPlayer.set(playerId, recentAttempts);
    if (recentAttempts.length >= 8) {
      const antiSpamPenalty = game.rules?.antiSpamPenalty ?? -1;
      player.score += antiSpamPenalty;
      player.lockedOut = true;
      pushGameLog(gameId, "anti_spam", `${player.name} spam buzz: ${antiSpamPenalty} point(s) + blocage`);
      setTimeout(() => {
        const currentGame = activeGames[gameId];
        if (!currentGame?.players[playerId]) return;
        currentGame.players[playerId].lockedOut = false;
        persistGame(currentGame);
        ctx.io.to(gameId).emit("game:stateUpdate", sanitizeGameState(currentGame));
      }, 5000);
      persistGame(game);
      ctx.io.to(gameId).emit("game:stateUpdate", sanitizeGameState(game));
      return callback({ success: false, error: "Anti-spam activé, vous êtes temporairement bloqué" });
    }

    if (game.status === "playing" && !game.buzzedPlayerId) {
      player.stats = player.stats || { buzzes: 0, correctAnswers: 0, wrongAnswers: 0 };
      player.stats.buzzes += 1;
      game.status = "paused";
      game.buzzedPlayerId = playerId;
      game.buzzTimestamp = Date.now();
      pushGameLog(gameId, "buzz", `${player.name} a buzzé`);
      persistGame(game);
      ctx.io.to(gameId).emit("game:playSound", "buzz");
      ctx.io.to(gameId).emit("game:stateUpdate", sanitizeGameState(game));
      callback({ success: true });
    } else {
      callback({ success: false, error: "Buzz non disponible" });
    }
  });
}
