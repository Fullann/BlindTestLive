import crypto from "crypto";
import { z } from "zod";
import { Player } from "../../src/types";
import { Ack, SocketHandlerContext } from "./context";

async function relayPlayerMicToHost(
  ctx: SocketHandlerContext,
  gameId: string,
  targetHostSocketId: string | undefined,
  event: "player:micOffer" | "player:micIceCandidate" | "player:micStopped",
  payload: Record<string, unknown>,
): Promise<boolean> {
  const game = ctx.activeGames[gameId];
  if (!game) return false;

  if (targetHostSocketId && targetHostSocketId.length > 0) {
    const sockets = await ctx.io.in(gameId).fetchSockets();
    const allowed = sockets.some(
      (s) =>
        s.id === targetHostSocketId &&
        s.data?.hostGameId === gameId &&
        (s.data?.hostRole === "owner" || s.data?.hostRole === "cohost"),
    );
    if (!allowed) return false;
    ctx.io.to(targetHostSocketId).emit(event, payload);
    return true;
  }

  if (game.adminId) {
    ctx.io.to(game.adminId).emit(event, payload);
    return true;
  }
  return false;
}

const playerJoinSchema = z.object({
  gameId: z.string().min(1).max(10),
  playerId: z.string().min(1).max(100).optional(),
  playerSecret: z.string().min(1).max(200).optional(),
  publicId: z.string().min(1).max(64).optional(),
  name: z.preprocess((v) => (typeof v === "string" ? v.trim() : v), z.string().min(1).max(20)),
  team: z.preprocess((v) => (typeof v === "string" ? v.trim() : v), z.string().min(1).max(32)).optional(),
});

const submitTextAnswerSchema = z.object({
  gameId: z.string().min(1).max(10),
  playerId: z.string().min(1).max(100),
  answer: z.string().min(1).max(200),
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

  const getCurrentTrackStat = (gameId: string) => {
    const game = activeGames[gameId];
    if (!game || !Array.isArray(game.playlist) || game.playlist.length === 0) return null;
    const trackIndex = game.currentTrackIndex;
    const track = game.playlist[trackIndex];
    if (!track) return null;
    if (!game.trackStats) game.trackStats = {};
    const key = String(trackIndex);
    if (!game.trackStats[key]) {
      game.trackStats[key] = {
        trackIndex,
        trackId: track.id,
        title: track.title || `Piste ${trackIndex + 1}`,
        artist: track.artist || "",
        playedCount: 0,
        totalBuzzes: 0,
        correctAnswers: 0,
        wrongAnswers: 0,
        revealedWithoutAnswer: 0,
      };
    }
    return game.trackStats[key];
  };

  const isTextAnswerEnabledForCurrentRound = (gameId: string) => {
    const game = activeGames[gameId];
    if (!game || !Array.isArray(game.rounds) || game.rounds.length === 0) return false;
    const round = game.rounds.find(
      (entry) => game.currentTrackIndex >= entry.startIndex && game.currentTrackIndex <= entry.endIndex,
    );
    return !!round?.textAnswersEnabled;
  };

  socket.on("player:joinGame", (rawPayload, callback: Ack) => {
    const parsed = playerJoinSchema.safeParse(rawPayload);
    if (!parsed.success) {
      return callback({ success: false, error: "Payload joueur invalide" });
    }
    const { gameId, playerId, playerSecret, publicId, name, team } = parsed.data;
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
      if (publicId) game.players[playerId].publicId = publicId;
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
      publicId,
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
    if (player?.frozenUntil && player.frozenUntil > now) {
      player.lockedOut = true;
    } else if (player?.frozenUntil && player.frozenUntil <= now) {
      player.frozenUntil = undefined;
      player.lockedOut = false;
    }
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
      const currentTrackStat = getCurrentTrackStat(gameId);
      if (currentTrackStat) {
        currentTrackStat.totalBuzzes += 1;
        currentTrackStat.title = game.playlist[game.currentTrackIndex]?.title || currentTrackStat.title;
        currentTrackStat.artist = game.playlist[game.currentTrackIndex]?.artist || currentTrackStat.artist;
        currentTrackStat.trackId = game.playlist[game.currentTrackIndex]?.id || currentTrackStat.trackId;
        if (game.trackStartTime) {
          const responseMs = Math.max(0, Date.now() - game.trackStartTime);
          if (currentTrackStat.fastestBuzzMs === undefined || responseMs < currentTrackStat.fastestBuzzMs) {
            currentTrackStat.fastestBuzzMs = responseMs;
            currentTrackStat.fastestBuzzPlayerId = playerId;
          }
        }
      }
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

  socket.on("player:submitTextAnswer", (rawPayload, callback: Ack) => {
    const parsed = submitTextAnswerSchema.safeParse(rawPayload);
    if (!parsed.success) {
      return callback({ success: false, error: "Payload invalide" });
    }
    const { gameId, playerId, answer } = parsed.data;
    const game = activeGames[gameId];
    if (!game) return callback({ success: false, error: "Partie introuvable" });
    const player = game.players[playerId];
    if (!player || player.socketId !== socket.id) {
      return callback({ success: false, error: "Joueur invalide" });
    }
    if (!["playing", "paused"].includes(game.status)) {
      return callback({ success: false, error: "Question ouverte indisponible" });
    }
    if (!isTextAnswerEnabledForCurrentRound(gameId)) {
      return callback({ success: false, error: "Question ouverte désactivée pour cette manche" });
    }
    const cleanAnswer = answer.trim().slice(0, 200);
    if (!cleanAnswer) return callback({ success: false, error: "Réponse vide" });
    game.textAnswers = Array.isArray(game.textAnswers) ? game.textAnswers : [];
    game.textAnswers.unshift({
      id: crypto.randomUUID(),
      playerId: player.id,
      playerName: player.name,
      answer: cleanAnswer,
      createdAt: Date.now(),
    });
    game.textAnswers = game.textAnswers.slice(0, 100);
    game.lastActivity = Date.now();
    persistGame(game);
    pushGameLog(gameId, "text_answer", `${player.name} a envoyé une réponse texte`);
    ctx.io.to(gameId).emit("game:stateUpdate", sanitizeGameState(game));
    callback({ success: true });
  });

  // ── WebRTC mic signaling relay (player → host) ──────────────────────────
  // Player sends WebRTC offer to host
  socket.on("player:micOffer", async (rawPayload, callback: Ack) => {
    const parsed = z
      .object({
        gameId: z.string().min(1).max(10),
        playerId: z.string().min(1).max(100),
        sdp: z.object({ type: z.string(), sdp: z.string() }),
        targetHostSocketId: z.string().min(1).max(128).optional(),
      })
      .safeParse(rawPayload);
    if (!parsed.success) return callback({ success: false, error: "Payload invalide" });
    const { gameId, playerId, sdp, targetHostSocketId } = parsed.data;
    const game = ctx.activeGames[gameId];
    if (!game) return callback({ success: false, error: "Partie introuvable" });
    const player = game.players[playerId];
    if (!player || player.socketId !== socket.id) return callback({ success: false, error: "Non autorisé" });
    const ok = await relayPlayerMicToHost(ctx, gameId, targetHostSocketId, "player:micOffer", { playerId, sdp });
    if (!ok) return callback({ success: false, error: "Animateur introuvable pour le micro" });
    callback({ success: true });
  });

  // Player sends ICE candidate to host
  socket.on("player:micIceCandidate", async (rawPayload, callback: Ack) => {
    const parsed = z
      .object({
        gameId: z.string().min(1).max(10),
        playerId: z.string().min(1).max(100),
        candidate: z.any(),
        targetHostSocketId: z.string().min(1).max(128).optional(),
      })
      .safeParse(rawPayload);
    if (!parsed.success) return callback({ success: false, error: "Payload invalide" });
    const { gameId, playerId, candidate, targetHostSocketId } = parsed.data;
    const game = ctx.activeGames[gameId];
    if (!game) return callback({ success: false, error: "Partie introuvable" });
    const player = game.players[playerId];
    if (!player || player.socketId !== socket.id) return callback({ success: false, error: "Non autorisé" });
    const ok = await relayPlayerMicToHost(ctx, gameId, targetHostSocketId, "player:micIceCandidate", {
      playerId,
      candidate,
    });
    if (!ok) return callback({ success: false, error: "Animateur introuvable pour le micro" });
    callback({ success: true });
  });

  // Player notifies host that mic was stopped
  socket.on("player:micStopped", async (rawPayload, callback: Ack) => {
    const parsed = z
      .object({
        gameId: z.string().min(1).max(10),
        playerId: z.string().min(1).max(100),
        targetHostSocketId: z.string().min(1).max(128).optional(),
      })
      .safeParse(rawPayload);
    if (!parsed.success) return callback({ success: false, error: "Payload invalide" });
    const { gameId, playerId, targetHostSocketId } = parsed.data;
    const game = ctx.activeGames[gameId];
    if (!game) return callback({ success: false, error: "Partie introuvable" });
    const player = game.players[playerId];
    if (!player || player.socketId !== socket.id) return callback({ success: false, error: "Non autorisé" });
    const ok = await relayPlayerMicToHost(ctx, gameId, targetHostSocketId, "player:micStopped", { playerId });
    if (!ok) return callback({ success: false, error: "Animateur introuvable pour le micro" });
    callback({ success: true });
  });
}
