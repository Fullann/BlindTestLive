import express from "express";
import { createServer as createViteServer } from "vite";
import { Server } from "socket.io";
import http from "http";
import crypto from "crypto";
import Database from "better-sqlite3";
import { z } from "zod";
import { GameState, Player, Track } from "./src/types";

const PORT = 3000;

type HostRole = "owner" | "cohost";
type HostPermission = "control" | "kick" | "end";
type ServerGameState = GameState & { hostRoles: Record<string, HostRole> };
type Ack = (result: { success: boolean; error?: string; [key: string]: unknown }) => void;

// Runtime cache + persistence
const activeGames: Record<string, ServerGameState> = {};
const db = new Database("blindtest.sqlite");
db.exec(`
  CREATE TABLE IF NOT EXISTS games (
    id TEXT PRIMARY KEY,
    state_json TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  );
`);

// Security & Rate Limiting
const MAX_GAMES = 500;
const gameCreationLimitsBySocket = new Map<string, number>();
const gameCreationLimitsByIp = new Map<string, number>();
const buzzRateLimitsBySocket = new Map<string, number>();
const buzzRateLimitsByIp = new Map<string, number>();

const insertOrReplaceGame = db.prepare(`
  INSERT INTO games (id, state_json, updated_at)
  VALUES (@id, @state_json, @updated_at)
  ON CONFLICT(id) DO UPDATE SET
    state_json = excluded.state_json,
    updated_at = excluded.updated_at
`);
const deleteGameStmt = db.prepare(`DELETE FROM games WHERE id = ?`);

const hostJoinSchema = z.object({
  gameId: z.string().min(1).max(10),
  hostToken: z.string().min(10).max(200),
});
const playerJoinSchema = z.object({
  gameId: z.string().min(1).max(10),
  playerId: z.string().min(1).max(100).optional(),
  playerSecret: z.string().min(1).max(200).optional(),
  name: z.string().min(1).max(20),
  team: z.enum(["red", "blue", "green", "yellow"]).optional(),
});
const gameIdSchema = z.string().min(1).max(10);
const requestStateSchema = z.object({
  gameId: z.string().min(1).max(10),
  playerId: z.string().min(1).max(100).optional(),
  playerSecret: z.string().min(1).max(200).optional(),
  hostToken: z.string().min(1).max(200).optional(),
  asScreen: z.boolean().optional(),
});

function auditLog(event: string, data: Record<string, unknown>) {
  console.info(
    JSON.stringify({
      ts: new Date().toISOString(),
      event,
      ...data,
    }),
  );
}

function loadGamesFromDb() {
  const rows = db.prepare(`SELECT id, state_json FROM games`).all() as { id: string; state_json: string }[];
  for (const row of rows) {
    try {
      const state = JSON.parse(row.state_json) as ServerGameState;
      activeGames[row.id] = state;
    } catch (error) {
      auditLog("game:load_failed", { gameId: row.id, error: String(error) });
    }
  }
}

function persistGame(game: ServerGameState) {
  insertOrReplaceGame.run({
    id: game.id,
    state_json: JSON.stringify(game),
    updated_at: Date.now(),
  });
}

function removeGame(gameId: string) {
  delete activeGames[gameId];
  deleteGameStmt.run(gameId);
}

// Cleanup inactive games (older than 2 hours)
setInterval(() => {
  const now = Date.now();
  for (const code in activeGames) {
    if (now - activeGames[code].lastActivity > 2 * 60 * 60 * 1000) {
      removeGame(code);
      auditLog("game:expired", { gameId: code });
    }
  }
}, 10 * 60 * 1000); // Run every 10 minutes

function enforceGameLimits(socketId: string, ip: string): boolean {
  if (Object.keys(activeGames).length >= MAX_GAMES) {
    return false;
  }
  const lastCreation = gameCreationLimitsBySocket.get(socketId) || 0;
  const lastCreationIp = gameCreationLimitsByIp.get(ip) || 0;
  if (Date.now() - lastCreation < 10000) { // 10 seconds limit
    return false;
  }
  if (Date.now() - lastCreationIp < 3000) { // 3 sec/IP
    return false;
  }
  
  // Remove any existing game hosted by this socket
  for (const code in activeGames) {
    if (activeGames[code].adminId === socketId) {
      removeGame(code);
    }
  }
  
  gameCreationLimitsBySocket.set(socketId, Date.now());
  gameCreationLimitsByIp.set(ip, Date.now());
  return true;
}

// Helper to generate a 6-character code
function generateGameCode(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// Helper to generate a random distinct color
function getRandomColor(): string {
  const colors = [
    "#ef4444", "#f97316", "#f59e0b", "#84cc16", "#22c55e",
    "#10b981", "#06b6d4", "#0ea5e9", "#3b82f6", "#6366f1",
    "#8b5cf6", "#a855f7", "#d946ef", "#f43f5e"
  ];
  return colors[Math.floor(Math.random() * colors.length)];
}

// Helper to shuffle an array
function shuffleArray<T>(array: T[]): T[] {
  const newArray = [...array];
  for (let i = newArray.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
  }
  return newArray;
}

// Helper to sanitize game state before sending to clients
function sanitizeGameState(game: ServerGameState): Omit<ServerGameState, "hostToken" | "hostRoles"> {
  const { hostToken, hostRoles, ...safeGame } = game;
  
  // Deep copy players to avoid mutating original state
  const safePlayers: Record<string, Player> = {};
  for (const [id, player] of Object.entries(safeGame.players)) {
    const { playerSecret, ...safePlayer } = player;
    safePlayers[id] = safePlayer;
  }
  
  return { ...safeGame, players: safePlayers };
}

function getHostRole(game: ServerGameState, hostToken: string): HostRole | null {
  return game.hostRoles[hostToken] || null;
}

function hasPermission(role: HostRole | null, permission: HostPermission): boolean {
  if (!role) return false;
  if (role === "owner") return true;
  if (role === "cohost") return permission === "control";
  return false;
}

async function startServer() {
  loadGamesFromDb();
  const app = express();
  const server = http.createServer(app);
  const io = new Server(server, {
    cors: { origin: "*" }
  });

  // API routes FIRST
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Socket.io logic
  io.on("connection", (socket) => {
    console.log("Client connected:", socket.id);
    const socketIp = socket.handshake.address || "unknown";

    // Host creates a game
    socket.on("host:createGame", (playlist: Track[], isTeamMode: boolean, callback: Ack) => {
      if (!enforceGameLimits(socket.id, socketIp)) {
        return callback({ success: false, error: "Trop de parties créées récemment ou limite globale atteinte." });
      }

      if (!Array.isArray(playlist) || playlist.length === 0 || playlist.length > 200) {
        return callback({ success: false, error: "Playlist invalide (max 200 pistes)." });
      }

      const sanitizedPlaylist = playlist.map(t => ({
        id: String(t.id).substring(0, 50),
        title: String(t.title).substring(0, 100),
        artist: String(t.artist).substring(0, 100),
        url: t.url ? String(t.url).substring(0, 500) : undefined,
        mediaType: t.mediaType ? String(t.mediaType).substring(0, 20) as any : undefined,
        mediaUrl: t.mediaUrl ? String(t.mediaUrl).substring(0, 1000) : undefined,
        textContent: t.textContent ? String(t.textContent).substring(0, 2000) : undefined,
        duration: typeof t.duration === 'number' ? Math.max(1, Math.min(300, t.duration)) : undefined,
        startTime: typeof t.startTime === 'number' ? Math.max(0, t.startTime) : undefined
      }));

      let code = generateGameCode();
      while (activeGames[code]) {
        code = generateGameCode();
      }

      const hostToken = crypto.randomUUID();
      const hasSpotifyTrack = sanitizedPlaylist.some(t => t.mediaType === 'spotify' || t.url?.startsWith('spotify:'));

      const newGame: ServerGameState = {
        id: code,
        adminId: socket.id,
        hostToken: hostToken,
        hostRoles: { [hostToken]: "owner" },
        status: "lobby",
        players: {},
        playlist: sanitizedPlaylist,
        currentTrackIndex: 0,
        buzzedPlayerId: null,
        buzzTimestamp: null,
        isTeamMode: isTeamMode || false,
        isSpotifyMode: hasSpotifyTrack,
        lastActivity: Date.now(),
      };

      activeGames[code] = newGame;
      persistGame(newGame);
      auditLog("game:created", { gameId: code, mode: hasSpotifyTrack ? "spotify" : "playlist", bySocket: socket.id, ip: socketIp });
      socket.join(code);
      callback({ success: true, gameId: code, hostToken });
      io.to(code).emit("game:stateUpdate", sanitizeGameState(newGame));
    });

    // Host creates a YouTube game
    socket.on("host:createYoutubeGame", (youtubeId: string, isTeamMode: boolean, callback: Ack) => {
      if (!enforceGameLimits(socket.id, socketIp)) {
        return callback({ success: false, error: "Trop de parties créées récemment ou limite globale atteinte." });
      }

      if (typeof youtubeId !== 'string' || !/^[\w-]{11}$/.test(youtubeId)) {
        return callback({ success: false, error: "ID YouTube invalide." });
      }

      let code = generateGameCode();
      while (activeGames[code]) {
        code = generateGameCode();
      }

      const hostToken = crypto.randomUUID();
      const newGame: ServerGameState = {
        id: code,
        adminId: socket.id,
        hostToken: hostToken,
        hostRoles: { [hostToken]: "owner" },
        status: "lobby",
        players: {},
        playlist: [],
        currentTrackIndex: 0,
        buzzedPlayerId: null,
        buzzTimestamp: null,
        youtubeVideoId: youtubeId,
        isTeamMode: isTeamMode || false,
        roundNumber: 1,
        lastActivity: Date.now(),
      };

      activeGames[code] = newGame;
      persistGame(newGame);
      auditLog("game:created", { gameId: code, mode: "youtube", bySocket: socket.id, ip: socketIp });
      socket.join(code);
      callback({ success: true, gameId: code, hostToken });
      io.to(code).emit("game:stateUpdate", sanitizeGameState(newGame));
    });

    // Host creates a Spotify game
    socket.on("host:createSpotifyGame", async (spotifyId: string, isTeamMode: boolean, callback: Ack) => {
      if (!enforceGameLimits(socket.id, socketIp)) {
        return callback({ success: false, error: "Trop de parties créées récemment ou limite globale atteinte." });
      }

      if (typeof spotifyId !== 'string' || !/^[a-zA-Z0-9]+$/.test(spotifyId) || spotifyId.length > 50) {
        return callback({ success: false, error: "ID Spotify invalide." });
      }

      try {
        const clientId = process.env.SPOTIFY_CLIENT_ID;
        const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;

        if (!clientId || !clientSecret) {
          callback({ success: false, error: "Veuillez configurer SPOTIFY_CLIENT_ID et SPOTIFY_CLIENT_SECRET dans les variables d'environnement." });
          return;
        }

        const tokenRes = await fetch('https://accounts.spotify.com/api/token', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': 'Basic ' + Buffer.from(clientId + ':' + clientSecret).toString('base64')
          },
          body: 'grant_type=client_credentials'
        });
        
        const tokenData = await tokenRes.json();
        if (!tokenData.access_token) {
          throw new Error("Impossible d'obtenir le token d'accès Spotify. Vérifiez vos identifiants.");
        }
        const token = tokenData.access_token;

        const playlistRes = await fetch(`https://api.spotify.com/v1/playlists/${spotifyId}/tracks?limit=100`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const playlistData = await playlistRes.json();

        if (!playlistData.items) {
          throw new Error("Invalid playlist data");
        }

        let tracks: Track[] = playlistData.items
          .filter((item: any) => item.track && item.track.id)
          .map((item: any) => ({
            id: item.track.id,
            title: item.track.name,
            artist: item.track.artists.map((a: any) => a.name).join(', '),
            url: `spotify:track:${item.track.id}`
          }));

        tracks = shuffleArray(tracks);

        let code = generateGameCode();
        while (activeGames[code]) {
          code = generateGameCode();
        }

        const hostToken = crypto.randomUUID();
        const newGame: ServerGameState = {
          id: code,
          adminId: socket.id,
          hostToken: hostToken,
          hostRoles: { [hostToken]: "owner" },
          status: "lobby",
          players: {},
          playlist: tracks,
          currentTrackIndex: 0,
          buzzedPlayerId: null,
          buzzTimestamp: null,
          isSpotifyMode: true,
          isTeamMode: isTeamMode || false,
          lastActivity: Date.now(),
        };

        activeGames[code] = newGame;
        persistGame(newGame);
        auditLog("game:created", { gameId: code, mode: "spotify", bySocket: socket.id, ip: socketIp });
        socket.join(code);
        callback({ success: true, gameId: code, hostToken });
        io.to(code).emit("game:stateUpdate", sanitizeGameState(newGame));
      } catch (e: any) {
        console.error("Spotify fetch error:", e);
        callback({ success: false, error: e.message || "Erreur lors de la récupération de la playlist Spotify" });
      }
    });

    // Check game info before joining
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
      callback({ success: true, isTeamMode: game.isTeamMode });
    });

    // Player joins a game
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
        if (['red', 'blue', 'green', 'yellow'].includes(team)) {
          sanitizedTeam = team;
        }
      }

      // Reconnect existing player
      if (playerId && game.players[playerId]) {
        if (game.players[playerId].playerSecret !== playerSecret) {
          return callback({ success: false, error: "Non autorisé" });
        }
        
        game.players[playerId].socketId = socket.id;
        game.players[playerId].name = sanitizedName;
        if (sanitizedTeam) game.players[playerId].team = sanitizedTeam;
        
        // If they were buzzed but disconnected, we might want to keep it, 
        // but for simplicity we just update their socket.
        // We also need to update buzzedPlayerId if it matches their old ID
        // Wait, buzzedPlayerId is their persistent ID now!
        
        socket.join(gameId);
        game.lastActivity = Date.now();
        persistGame(game);
        callback({ success: true, player: game.players[playerId] });
        io.to(gameId).emit("game:stateUpdate", sanitizeGameState(game));
        return;
      }

      // New player
      const newPlayerId = playerId || socket.id; // Use persistent ID if provided
      const newPlayer: Player = {
        id: newPlayerId,
        socketId: socket.id,
        name: sanitizedName,
        color: getRandomColor(),
        score: 0,
        lockedOut: false,
        team: sanitizedTeam,
        playerSecret: playerSecret || crypto.randomUUID(),
      };

      game.players[newPlayerId] = newPlayer;
      game.lastActivity = Date.now();
      persistGame(game);
      socket.join(gameId);
      callback({ success: true, player: newPlayer });
      io.to(gameId).emit("game:stateUpdate", sanitizeGameState(game));
    });

    // Screen joins a game
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

    // Host rejoins a game
    socket.on("host:joinGame", (rawPayload, callback: Ack) => {
      const parsed = hostJoinSchema.safeParse(rawPayload);
      if (!parsed.success) {
        return callback({ success: false, error: "Payload host invalide" });
      }
      const { gameId, hostToken } = parsed.data;
      const game = activeGames[gameId];
      if (!game) {
        return callback({ success: false, error: "Game not found" });
      }
      const role = getHostRole(game, hostToken);
      if (!role) {
        return callback({ success: false, error: "Unauthorized" });
      }
      game.adminId = socket.id;
      socket.join(gameId);
      game.lastActivity = Date.now();
      persistGame(game);
      callback({ success: true, role });
      socket.emit("game:stateUpdate", sanitizeGameState(game));
    });

    // Host can generate a co-host token (owner only)
    socket.on("host:createCohostToken", (rawPayload, callback: Ack) => {
      const parsed = hostJoinSchema.safeParse(rawPayload);
      if (!parsed.success) return callback({ success: false, error: "Payload invalide" });
      const { gameId, hostToken } = parsed.data;
      const game = activeGames[gameId];
      if (!game) return callback({ success: false, error: "Game not found" });
      if (!hasPermission(getHostRole(game, hostToken), "end")) {
        return callback({ success: false, error: "Permission refusée" });
      }
      const cohostToken = crypto.randomUUID();
      game.hostRoles[cohostToken] = "cohost";
      persistGame(game);
      callback({ success: true, cohostToken });
    });

    // Resync endpoint
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

    // Host starts game or next track
    socket.on("host:startTrack", ({ gameId, hostToken }, callback: Ack) => {
      const game = activeGames[gameId];
      const role = game ? getHostRole(game, hostToken) : null;
      if (game && hasPermission(role, "control")) {
        game.lastActivity = Date.now();
        game.status = "countdown";
        game.countdown = 3;
        game.buzzedPlayerId = null;
        game.buzzTimestamp = null;
        Object.values(game.players).forEach(p => p.lockedOut = false);
        persistGame(game);
        io.to(gameId).emit("game:stateUpdate", sanitizeGameState(game));

        let count = 3;
        const interval = setInterval(() => {
          count--;
          if (activeGames[gameId] !== game || game.status !== "countdown") {
            clearInterval(interval);
            return;
          }
          if (count <= 0) {
            clearInterval(interval);
            game.status = "playing";
            game.countdown = 0;
            game.trackStartTime = Date.now();
            persistGame(game);
            io.to(gameId).emit("game:stateUpdate", sanitizeGameState(game));
          } else {
            game.countdown = count;
            persistGame(game);
            io.to(gameId).emit("game:stateUpdate", sanitizeGameState(game));
          }
        }, 1000);
        callback({ success: true });
      } else {
        callback({ success: false, error: "Permission refusée" });
      }
    });

    // Player buzzes
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
      if (!player || player.lockedOut || player.socketId !== socket.id) return callback({ success: false, error: "Buzz refusé" });

      // Only accept buzz if game is playing and no one else buzzed yet
      if (game.status === "playing" && !game.buzzedPlayerId) {
        game.status = "paused";
        game.buzzedPlayerId = playerId;
        game.buzzTimestamp = Date.now();
        persistGame(game);
        io.to(gameId).emit("game:playSound", "buzz");
        io.to(gameId).emit("game:stateUpdate", sanitizeGameState(game));
        callback({ success: true });
      } else {
        callback({ success: false, error: "Buzz non disponible" });
      }
    });

    // Host awards points
    socket.on("host:awardPoints", ({ gameId, playerId, points, hostToken }, callback: Ack) => {
      const game = activeGames[gameId];
      const role = game ? getHostRole(game, hostToken) : null;
      if (game && hasPermission(role, "control")) {
        game.lastActivity = Date.now();
        const safePoints = typeof points === 'number' ? Math.max(-100, Math.min(100, points)) : 1;
        if (game.players[playerId]) {
          game.players[playerId].score += safePoints;
        }
        game.status = "revealed";
        if (game.youtubeVideoId) {
          game.roundNumber = (game.roundNumber || 1) + 1;
        }
        persistGame(game);
        io.to(gameId).emit("game:playSound", "correct");
        io.to(gameId).emit("game:stateUpdate", sanitizeGameState(game));
        callback({ success: true });
      } else {
        callback({ success: false, error: "Permission refusée" });
      }
    });

    // Host penalizes player (wrong answer)
    socket.on("host:penalize", ({ gameId, playerId, hostToken }, callback: Ack) => {
      const game = activeGames[gameId];
      const role = game ? getHostRole(game, hostToken) : null;
      if (game && hasPermission(role, "control")) {
        game.lastActivity = Date.now();
        // Unlock all other players so they aren't blocked forever
        Object.values(game.players).forEach(p => {
          if (p.id !== playerId) {
            p.lockedOut = false;
          }
        });
        
        // Lock the player who just got it wrong
        if (game.players[playerId]) {
          game.players[playerId].lockedOut = true;
        }
        
        // Shift trackStartTime forward by the paused duration
        if (game.trackStartTime && game.buzzTimestamp) {
          game.trackStartTime += (Date.now() - game.buzzTimestamp);
        }

        game.status = "playing";
        game.buzzedPlayerId = null;
        game.buzzTimestamp = null;
        persistGame(game);
        io.to(gameId).emit("game:playSound", "wrong");
        io.to(gameId).emit("game:stateUpdate", sanitizeGameState(game));
        callback({ success: true });
      } else {
        callback({ success: false, error: "Permission refusée" });
      }
    });

    // Host unlocks a specific player manually
    socket.on("host:unlockPlayer", ({ gameId, playerId, hostToken }, callback: Ack) => {
      const game = activeGames[gameId];
      const role = game ? getHostRole(game, hostToken) : null;
      if (game && hasPermission(role, "control")) {
        if (game.players[playerId]) {
          game.players[playerId].lockedOut = false;
          persistGame(game);
          io.to(gameId).emit("game:stateUpdate", sanitizeGameState(game));
        }
        callback({ success: true });
      } else {
        callback({ success: false, error: "Permission refusée" });
      }
    });

    // Host ends the game
    socket.on("host:endGame", ({ gameId, hostToken }, callback: Ack) => {
      const game = activeGames[gameId];
      const role = game ? getHostRole(game, hostToken) : null;
      if (game && hasPermission(role, "end")) {
        game.lastActivity = Date.now();
        game.status = "finished";
        persistGame(game);
        auditLog("game:ended", { gameId, byRole: role, bySocket: socket.id });
        io.to(gameId).emit("game:stateUpdate", sanitizeGameState(game));
        callback({ success: true });
      } else {
        callback({ success: false, error: "Permission refusée" });
      }
    });

    // Host kicks a player
    socket.on("host:kickPlayer", ({ gameId, playerId, hostToken }, callback: Ack) => {
      const game = activeGames[gameId];
      const role = game ? getHostRole(game, hostToken) : null;
      if (game && hasPermission(role, "kick")) {
        if (game.players[playerId]) {
          const playerSocketId = game.players[playerId].socketId;
          delete game.players[playerId];
          persistGame(game);
          auditLog("player:kicked", { gameId, playerId, byRole: role, bySocket: socket.id });
          io.to(playerSocketId).emit("player:kicked");
          io.to(gameId).emit("game:stateUpdate", sanitizeGameState(game));
        }
        callback({ success: true });
      } else {
        callback({ success: false, error: "Permission refusée" });
      }
    });

    // Host reveals answer without awarding points
    socket.on("host:revealAnswer", ({ gameId, hostToken }, callback: Ack) => {
      const game = activeGames[gameId];
      const role = game ? getHostRole(game, hostToken) : null;
      if (game && hasPermission(role, "control")) {
        game.lastActivity = Date.now();
        game.status = "revealed";
        if (game.youtubeVideoId) {
          game.roundNumber = (game.roundNumber || 1) + 1;
        }
        persistGame(game);
        io.to(gameId).emit("game:stateUpdate", sanitizeGameState(game));
        callback({ success: true });
      } else {
        callback({ success: false, error: "Permission refusée" });
      }
    });

    // Host resumes youtube video
    socket.on("host:resumeYoutube", ({ gameId, hostToken }, callback: Ack) => {
      const game = activeGames[gameId];
      const role = game ? getHostRole(game, hostToken) : null;
      if (game && hasPermission(role, "control")) {
        game.status = "countdown";
        game.countdown = 3;
        game.buzzedPlayerId = null;
        game.buzzTimestamp = null;
        Object.values(game.players).forEach(p => p.lockedOut = false);
        persistGame(game);
        io.to(gameId).emit("game:stateUpdate", sanitizeGameState(game));

        let count = 3;
        const interval = setInterval(() => {
          count--;
          if (activeGames[gameId] !== game || game.status !== "countdown") {
            clearInterval(interval);
            return;
          }
          if (count <= 0) {
            clearInterval(interval);
            game.status = "playing";
            game.countdown = 0;
            persistGame(game);
            io.to(gameId).emit("game:stateUpdate", sanitizeGameState(game));
          } else {
            game.countdown = count;
            persistGame(game);
            io.to(gameId).emit("game:stateUpdate", sanitizeGameState(game));
          }
        }, 1000);
        callback({ success: true });
      } else {
        callback({ success: false, error: "Permission refusée" });
      }
    });

    // Host goes to next track
    socket.on("host:nextTrack", ({ gameId, hostToken }, callback: Ack) => {
      const game = activeGames[gameId];
      const role = game ? getHostRole(game, hostToken) : null;
      if (game && hasPermission(role, "control")) {
        game.lastActivity = Date.now();
        if (game.currentTrackIndex < game.playlist.length - 1) {
          game.currentTrackIndex++;
          game.status = "countdown";
          game.countdown = 3;
          game.buzzedPlayerId = null;
          game.buzzTimestamp = null;
          Object.values(game.players).forEach(p => p.lockedOut = false);
          persistGame(game);
          io.to(gameId).emit("game:stateUpdate", sanitizeGameState(game));

          let count = 3;
          const interval = setInterval(() => {
            count--;
            if (activeGames[gameId] !== game || game.status !== "countdown") {
              clearInterval(interval);
              return;
            }
            if (count <= 0) {
              clearInterval(interval);
              game.status = "playing";
              game.countdown = 0;
              game.trackStartTime = Date.now();
              persistGame(game);
              io.to(gameId).emit("game:stateUpdate", sanitizeGameState(game));
            } else {
              game.countdown = count;
              persistGame(game);
              io.to(gameId).emit("game:stateUpdate", sanitizeGameState(game));
            }
          }, 1000);
        } else {
          game.status = "finished";
          persistGame(game);
          io.to(gameId).emit("game:stateUpdate", sanitizeGameState(game));
        }
        callback({ success: true });
      } else {
        callback({ success: false, error: "Permission refusée" });
      }
    });

    socket.on("disconnect", () => {
      // Handle player disconnect (optional: keep them in state but mark offline)
      // For MVP, we can just leave them in the game state so they can reconnect if needed,
      // or remove them if they were just in lobby.
      console.log("Client disconnected:", socket.id);
      buzzRateLimitsBySocket.delete(socket.id);
      gameCreationLimitsBySocket.delete(socket.id);
    });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static("dist"));
  }

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
