import "dotenv/config";
import express from "express";
import { Server } from "socket.io";
import http from "http";
import fs from "fs";
import path from "path";
import * as Sentry from "@sentry/node";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import crypto from "crypto";
import { Player } from "./src/types";
import { registerGameStateHandlers } from "./server/socket/game-state";
import { registerHostHandlers } from "./server/socket/host";
import { registerPlayerHandlers } from "./server/socket/player";
import { registerScreenHandlers } from "./server/socket/screen";
import { registerDeviceHandlers } from "./server/socket/devices";
import { registerPlaylistCollabHandlers } from "./server/socket/playlist-collab";
import { HostPermission, HostRole, ServerGameState } from "./server/socket/context";
import authRouter from "./server/routes/auth";
import playlistsRouter from "./server/routes/playlists";
import blindtestsRouter from "./server/routes/blindtests";
import hardwareRouter from "./server/routes/hardware";
import eventsRouter from "./server/routes/events";
import playerProfilesRouter from "./server/routes/player-profiles";
import { redactAuditPayload } from "./server/redactSecrets";

const PORT = Number(process.env.PORT || 5174);
/** Fenêtre 60s : au-delà, nouvelles connexions socket depuis la même IP sont refusées (NAT événement = même IP publique). */
const SOCKET_MAX_CONN_PER_IP_PER_MINUTE = Math.max(
  20,
  Number(process.env.SOCKET_MAX_CONN_PER_IP_PER_MINUTE || 80),
);
const DATA_DIR = path.resolve(process.cwd(), "data");
const GAMES_FILE = path.join(DATA_DIR, "games.json");
const METRICS_TOKEN = process.env.METRICS_TOKEN || "";
const ENABLE_DB =
  process.env.ENABLE_DB === "true" ||
  (process.env.NODE_ENV === "production" && process.env.ENABLE_DB !== "false");

function parseAllowedOrigins() {
  const raw = process.env.ALLOWED_ORIGINS || "";
  const origins = raw
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
  const localDevOrigin = `http://localhost:${PORT}`;
  const localDevOrigin127 = `http://127.0.0.1:${PORT}`;

  if (process.env.NODE_ENV !== "production") {
    if (!origins.includes(localDevOrigin)) origins.push(localDevOrigin);
    if (!origins.includes(localDevOrigin127)) origins.push(localDevOrigin127);
  }
  if (origins.length === 0) {
    return [localDevOrigin, localDevOrigin127];
  }
  return origins;
}
const allowedOrigins = parseAllowedOrigins();

// Runtime cache + persistence
const activeGames: Record<string, ServerGameState> = {};

// Security & Rate Limiting
const MAX_GAMES = 500;
const gameCreationLimitsBySocket = new Map<string, number>();
const gameCreationLimitsByIp = new Map<string, number>();
const buzzRateLimitsBySocket = new Map<string, number>();
const buzzRateLimitsByIp = new Map<string, number>();
const ipConnectionCounters = new Map<string, { count: number; firstSeen: number }>();
const metrics = {
  connectionsTotal: 0,
  rejectedConnections: 0,
  eventsTotal: 0,
  gamesCreated: 0,
};
const connectedDeviceSockets = new Map<string, string>();
let analyticsSchemaChecked = false;
let dbPool: any = null;

function auditLog(event: string, data: Record<string, unknown>) {
  metrics.eventsTotal += 1;
  if (event === "game:created") metrics.gamesCreated += 1;
  const safe = redactAuditPayload(data);
  console.info(
    JSON.stringify({
      ts: new Date().toISOString(),
      event,
      ...safe,
    }),
  );
}

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function loadGamesFromDisk() {
  ensureDataDir();
  if (!fs.existsSync(GAMES_FILE)) {
    return;
  }

  let parsed: Record<string, ServerGameState> = {};
  try {
    const raw = fs.readFileSync(GAMES_FILE, "utf-8");
    parsed = raw ? (JSON.parse(raw) as Record<string, ServerGameState>) : {};
  } catch (error) {
    auditLog("game:load_failed", { gameId: "all", error: String(error) });
    return;
  }

  for (const [gameId, state] of Object.entries(parsed)) {
    try {
      activeGames[gameId] = state;
    } catch (error) {
      auditLog("game:load_failed", { gameId, error: String(error) });
    }
  }
}

function persistAllGames() {
  ensureDataDir();
  fs.writeFileSync(GAMES_FILE, JSON.stringify(activeGames), "utf-8");
}

function persistGame(game: ServerGameState) {
  activeGames[game.id] = game;
  persistAllGames();
}

function removeGame(gameId: string) {
  delete activeGames[gameId];
  persistAllGames();
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
}, 10 * 60 * 1000);

function enforceGameLimits(socketId: string, ip: string): boolean {
  if (Object.keys(activeGames).length >= MAX_GAMES) {
    return false;
  }
  const lastCreation = gameCreationLimitsBySocket.get(socketId) || 0;
  const lastCreationIp = gameCreationLimitsByIp.get(ip) || 0;
  if (Date.now() - lastCreation < 10000) {
    return false;
  }
  if (Date.now() - lastCreationIp < 3000) {
    return false;
  }

  for (const code in activeGames) {
    if (activeGames[code].adminId === socketId) {
      removeGame(code);
    }
  }

  gameCreationLimitsBySocket.set(socketId, Date.now());
  gameCreationLimitsByIp.set(ip, Date.now());
  return true;
}

function isIpAllowed(ip: string): boolean {
  const now = Date.now();
  const current = ipConnectionCounters.get(ip);
  if (!current) {
    ipConnectionCounters.set(ip, { count: 1, firstSeen: now });
    return true;
  }
  if (now - current.firstSeen > 60_000) {
    ipConnectionCounters.set(ip, { count: 1, firstSeen: now });
    return true;
  }
  current.count += 1;
  ipConnectionCounters.set(ip, current);
  return current.count <= SOCKET_MAX_CONN_PER_IP_PER_MINUTE;
}

function generateGameCode(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

function getRandomColor(): string {
  const colors = [
    "#ef4444", "#f97316", "#f59e0b", "#84cc16", "#22c55e",
    "#10b981", "#06b6d4", "#0ea5e9", "#3b82f6", "#6366f1",
    "#8b5cf6", "#a855f7", "#d946ef", "#f43f5e"
  ];
  return colors[Math.floor(Math.random() * colors.length)];
}

function shuffleArray<T>(array: T[]): T[] {
  const newArray = [...array];
  for (let i = newArray.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
  }
  return newArray;
}

function sanitizeGameState(game: ServerGameState): Omit<ServerGameState, "hostToken" | "hostRoles" | "cohostTokenExpiresAt"> {
  const { hostToken, hostRoles, cohostTokenExpiresAt, ...safeGame } = game;

  const safePlayers: Record<string, Player> = {};
  for (const [id, player] of Object.entries(safeGame.players)) {
    const { playerSecret, ...safePlayer } = player;
    safePlayers[id] = safePlayer;
  }

  return { ...safeGame, players: safePlayers };
}

function getHostRole(game: ServerGameState, hostToken: string): HostRole | null {
  if (game.hostTokenExpiresAt && Date.now() > game.hostTokenExpiresAt) {
    return null;
  }
  const role = game.hostRoles[hostToken] || null;
  if (role === "cohost") {
    const expiresAt = game.cohostTokenExpiresAt?.[hostToken];
    if (!expiresAt || Date.now() > expiresAt) {
      return null;
    }
  }
  return role;
}

function hasPermission(role: HostRole | null, permission: HostPermission): boolean {
  if (!role) return false;
  if (role === "owner") return true;
  if (role === "cohost") return permission === "control";
  return false;
}

function isAllowedOrigin(originHeader?: string | null) {
  if (!originHeader) return true;
  return allowedOrigins.includes(originHeader);
}

async function ensureAnalyticsSchema() {
  if (analyticsSchemaChecked || !dbPool) return;
  await dbPool.query(
    `CREATE TABLE IF NOT EXISTS game_analytics (
      id VARCHAR(36) NOT NULL PRIMARY KEY,
      game_id VARCHAR(10) NOT NULL,
      ended_reason VARCHAR(64) NOT NULL,
      players_count INT NOT NULL DEFAULT 0,
      total_buzzes INT NOT NULL DEFAULT 0,
      total_correct INT NOT NULL DEFAULT 0,
      total_wrong INT NOT NULL DEFAULT 0,
      created_at BIGINT NOT NULL,
      INDEX idx_game_analytics_game (game_id),
      INDEX idx_game_analytics_created (created_at)
    )`,
  );
  await dbPool.query(
    `CREATE TABLE IF NOT EXISTS game_player_analytics (
      id VARCHAR(36) NOT NULL PRIMARY KEY,
      analytics_id VARCHAR(36) NOT NULL,
      player_id VARCHAR(100) NOT NULL,
      public_id VARCHAR(64) NULL,
      player_name VARCHAR(64) NOT NULL,
      score INT NOT NULL DEFAULT 0,
      buzzes INT NOT NULL DEFAULT 0,
      correct_answers INT NOT NULL DEFAULT 0,
      wrong_answers INT NOT NULL DEFAULT 0,
      created_at BIGINT NOT NULL,
      INDEX idx_game_player_analytics_analytics (analytics_id),
      INDEX idx_game_player_analytics_public (public_id)
    )`,
  );
  analyticsSchemaChecked = true;
}

async function runStartupMigrations() {
  if (!dbPool) return;

  // Colonnes store playlists
  await dbPool.query(
    `CREATE TABLE IF NOT EXISTS playlist_likes (
      playlist_id VARCHAR(36) NOT NULL,
      user_id     VARCHAR(36) NOT NULL,
      created_at  BIGINT      NOT NULL,
      PRIMARY KEY (playlist_id, user_id),
      INDEX idx_playlist_likes_user (user_id)
    )`,
  );
  for (const [col, def] of [
    ["category",        "category VARCHAR(64) NOT NULL DEFAULT 'general'"],
    ["likes_count",     "likes_count INT NOT NULL DEFAULT 0"],
    ["downloads_count", "downloads_count INT NOT NULL DEFAULT 0"],
  ] as const) {
    const [rows] = await dbPool.query(
      `SELECT 1 FROM information_schema.columns
       WHERE table_schema = DATABASE() AND table_name = 'playlists' AND column_name = ?
       LIMIT 1`,
      [col],
    );
    if ((rows as any[]).length === 0) {
      await dbPool.query(`ALTER TABLE playlists ADD COLUMN ${def}`).catch((e: any) => {
        if (e?.code !== "ER_DUP_FIELDNAME") throw e;
      });
    }
  }

  // Tokens collaboration
  await dbPool.query(
    `CREATE TABLE IF NOT EXISTS playlist_collab_tokens (
      playlist_id VARCHAR(36)  NOT NULL,
      token       VARCHAR(255) NOT NULL,
      created_by  VARCHAR(36)  NOT NULL,
      created_at  BIGINT       NOT NULL,
      expires_at  BIGINT       NOT NULL,
      PRIMARY KEY (playlist_id, token),
      INDEX idx_collab_token (token),
      INDEX idx_collab_expires (expires_at)
    )`,
  );

  // Tournois multi-soirées
  await dbPool.query(
    `CREATE TABLE IF NOT EXISTS tournaments (
      id         VARCHAR(36)  NOT NULL PRIMARY KEY,
      owner_id   VARCHAR(36)  NOT NULL,
      name       VARCHAR(255) NOT NULL,
      starts_at  BIGINT       NULL,
      ends_at    BIGINT       NULL,
      created_at BIGINT       NOT NULL,
      INDEX idx_tournaments_owner (owner_id)
    )`,
  );
  await dbPool.query(
    `CREATE TABLE IF NOT EXISTS tournament_sessions (
      tournament_id VARCHAR(36) NOT NULL,
      blindtest_id  VARCHAR(36) NOT NULL,
      created_at    BIGINT      NOT NULL,
      PRIMARY KEY (tournament_id, blindtest_id),
      INDEX idx_tournament_sessions_bt (blindtest_id)
    )`,
  );

  // Branding événement
  await dbPool.query(
    `CREATE TABLE IF NOT EXISTS event_branding (
      blindtest_id  VARCHAR(36)  NOT NULL PRIMARY KEY,
      owner_id      VARCHAR(36)  NOT NULL,
      client_name   VARCHAR(255) NOT NULL DEFAULT '',
      logo_url      TEXT         NULL,
      primary_color VARCHAR(16)  NOT NULL DEFAULT '#6366f1',
      accent_color  VARCHAR(16)  NOT NULL DEFAULT '#a855f7',
      created_at    BIGINT       NOT NULL,
      updated_at    BIGINT       NOT NULL,
      INDEX idx_event_branding_owner (owner_id)
    )`,
  );

  // Profils joueurs persistants
  await dbPool.query(
    `CREATE TABLE IF NOT EXISTS player_profiles (
      public_id      VARCHAR(64) NOT NULL PRIMARY KEY,
      nickname       VARCHAR(32) NOT NULL,
      badges_json    JSON        NOT NULL,
      seasons_json   JSON        NOT NULL,
      total_sessions INT         NOT NULL DEFAULT 0,
      total_score    INT         NOT NULL DEFAULT 0,
      total_buzzes   INT         NOT NULL DEFAULT 0,
      total_correct  INT         NOT NULL DEFAULT 0,
      total_wrong    INT         NOT NULL DEFAULT 0,
      created_at     BIGINT      NOT NULL,
      updated_at     BIGINT      NOT NULL,
      INDEX idx_player_profiles_nickname (nickname)
    )`,
  );
  await dbPool.query(
    `CREATE TABLE IF NOT EXISTS player_profile_sessions (
      id              VARCHAR(36) NOT NULL PRIMARY KEY,
      public_id       VARCHAR(64) NOT NULL,
      game_id         VARCHAR(10) NOT NULL,
      player_name     VARCHAR(64) NOT NULL,
      score           INT         NOT NULL DEFAULT 0,
      buzzes          INT         NOT NULL DEFAULT 0,
      correct_answers INT         NOT NULL DEFAULT 0,
      wrong_answers   INT         NOT NULL DEFAULT 0,
      created_at      BIGINT      NOT NULL,
      INDEX idx_player_profile_sessions_public (public_id),
      INDEX idx_player_profile_sessions_created (created_at)
    )`,
  );

  // Analytics
  await ensureAnalyticsSchema();

  console.info("DB migrations: OK");
}

async function startServer() {
  loadGamesFromDisk();
  if (process.env.SENTRY_DSN) {
    Sentry.init({ dsn: process.env.SENTRY_DSN });
  }
  const app = express();
  if (ENABLE_DB) {
    const dbModule = await import("./server/db");
    dbPool = dbModule.default;
    try {
      await runStartupMigrations();
    } catch (error) {
      console.warn("DB startup migrations skipped:", error);
    }
  }
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
      crossOriginOpenerPolicy: false,
    }),
  );
  app.set("trust proxy", 1);
  const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
  });
  app.use("/api/", apiLimiter);
  app.use("/api/", (req, res, next) => {
    if (!isAllowedOrigin(req.headers.origin)) {
      return res.status(403).json({ error: "Origin non autorisée" });
    }
    return next();
  });
  const server = http.createServer(app);
  const io = new Server(server, {
    cors: {
      origin: (origin, callback) => {
        if (!origin || isAllowedOrigin(origin)) {
          return callback(null, true);
        }
        return callback(new Error("Origin non autorisée"));
      },
      credentials: true,
    },
    // Moins de surprises derrière certains reverse proxies (compression WS).
    perMessageDeflate: false,
    connectTimeout: 30_000,
    // Détection de coupure plus rapide : ping toutes les 10 s, timeout après 15 s.
    // Valeurs par défaut Socket.IO : 25 s / 20 s → délai total ~45 s avant de voir un joueur déco.
    pingInterval: 10_000,
    pingTimeout: 15_000,
  });
  const devicesNamespace = io.of("/devices");

  app.use(express.json({ limit: "10mb" }));
  app.use(cookieParser());

  // Fichiers uploadés (musique, images, vidéos)
  const uploadsDir = path.resolve(process.cwd(), "uploads");
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }
  app.use("/uploads", express.static(uploadsDir));

  // Routes API (DB optionnelle en développement)
  if (ENABLE_DB) {
    app.use("/api/auth", authRouter);
    app.use("/api/playlists", playlistsRouter);
    app.use("/api/blindtests", blindtestsRouter);
    app.use("/api/hardware", hardwareRouter);
    app.use("/api/events", eventsRouter);
    app.use("/api/player-profiles", playerProfilesRouter);
  } else {
    app.use(["/api/auth", "/api/playlists", "/api/blindtests", "/api/hardware", "/api/events", "/api/player-profiles"], (_req, res) => {
      res.status(503).json({
        error: "Base de données désactivée en mode dev. Lance avec ENABLE_DB=true pour activer ces routes.",
      });
    });
  }

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.get("/api/health/realtime", async (_req, res) => {
    let dbStatus: "enabled" | "disabled" | "error" = ENABLE_DB ? "enabled" : "disabled";
    if (ENABLE_DB && dbPool) {
      try {
        await dbPool.query("SELECT 1");
      } catch {
        dbStatus = "error";
      }
    }
    const activeSockets = io.engine.clientsCount;
    const devicesSockets = devicesNamespace.sockets.size;
    const payload = {
      status: dbStatus === "error" ? "degraded" : "ok",
      realtime: {
        activeSockets,
        devicesSockets,
        activeGames: Object.keys(activeGames).length,
      },
      db: dbStatus,
      serverTs: Date.now(),
    };
    if (dbStatus === "error") {
      return res.status(503).json(payload);
    }
    return res.json(payload);
  });

  app.get("/api/metrics", (req, res) => {
    if (process.env.NODE_ENV === "production") {
      const token = String(req.headers["x-metrics-token"] || "");
      if (!METRICS_TOKEN || token !== METRICS_TOKEN) {
        return res.status(401).json({ error: "Non autorisé" });
      }
    }
    res.json({
      ...metrics,
      activeGames: Object.keys(activeGames).length,
      activeSockets: io.engine.clientsCount,
      trackedIps: ipConnectionCounters.size,
    });
  });

  // Socket.io logic
  io.on("connection", (socket) => {
    console.log("Client connected:", socket.id);
    const socketIp = socket.handshake.address || "unknown";
    metrics.connectionsTotal += 1;
    if (!isIpAllowed(socketIp)) {
      metrics.rejectedConnections += 1;
      socket.emit("server:error", "Trop de connexions depuis cette IP, réessayez plus tard.");
      socket.disconnect(true);
      return;
    }
    const socketContext = {
      io,
      socket,
      socketIp,
      activeGames,
      persistGame,
      removeGame,
      enforceGameLimits,
      sanitizeGameState,
      getHostRole,
      hasPermission,
      generateGameCode,
      getRandomColor,
      shuffleArray,
      buzzRateLimitsBySocket,
      buzzRateLimitsByIp,
      auditLog,
      persistFinishedGameAnalytics: async (game: ServerGameState, reason: string) => {
        if (!ENABLE_DB || !dbPool) return;
        try {
          await ensureAnalyticsSchema();
          const analyticsId = crypto.randomUUID();
          const now = Date.now();
          const players = Object.values(game.players || {});
          const totalBuzzes = players.reduce((sum, player) => sum + Number(player.stats?.buzzes || 0), 0);
          const totalCorrect = players.reduce((sum, player) => sum + Number(player.stats?.correctAnswers || 0), 0);
          const totalWrong = players.reduce((sum, player) => sum + Number(player.stats?.wrongAnswers || 0), 0);
          await dbPool.query(
            `INSERT INTO game_analytics (id, game_id, ended_reason, players_count, total_buzzes, total_correct, total_wrong, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [analyticsId, game.id, reason.slice(0, 64), players.length, totalBuzzes, totalCorrect, totalWrong, now],
          );
          for (const player of players as Player[]) {
            await dbPool.query(
              `INSERT INTO game_player_analytics
                 (id, analytics_id, player_id, public_id, player_name, score, buzzes, correct_answers, wrong_answers, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                crypto.randomUUID(),
                analyticsId,
                player.id,
                player.publicId || null,
                String(player.name || "Joueur").slice(0, 64),
                Number(player.score || 0),
                Number(player.stats?.buzzes || 0),
                Number(player.stats?.correctAnswers || 0),
                Number(player.stats?.wrongAnswers || 0),
                now,
              ],
            );
          }
        } catch (error) {
          console.warn("persistFinishedGameAnalytics failed:", error);
        }
      },
    };

    registerHostHandlers(socketContext);
    registerPlayerHandlers(socketContext);
    registerScreenHandlers(socketContext);
    registerGameStateHandlers(socketContext);
    registerPlaylistCollabHandlers({ io, socket });

    socket.on("disconnect", () => {
      console.log("Client disconnected:", socket.id);
      buzzRateLimitsBySocket.delete(socket.id);
      gameCreationLimitsBySocket.delete(socket.id);
    });
  });

  devicesNamespace.on("connection", (socket) => {
    const socketIp = socket.handshake.address || "unknown";
    registerDeviceHandlers({
      io,
      devicesNamespace,
      socket,
      socketIp,
      activeGames,
      persistGame,
      connectedDeviceSockets,
      sanitizeGameState,
      enableDb: ENABLE_DB,
    });
  });

  // Use Vite middleware only when explicitly in development.
  // Some shared hosts may not inject NODE_ENV reliably for Passenger apps.
  if (process.env.NODE_ENV === "development") {
    const viteModulePath = "vite";
    const { createServer: createViteServer } = await import(viteModulePath);
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(process.cwd(), "dist")));
    app.get("*", (_req, res) => {
      res.sendFile(path.resolve(process.cwd(), "dist", "index.html"));
    });
  }

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Database routes: ${ENABLE_DB ? "enabled" : "disabled"}`);
  });
}

startServer();
