"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const express_1 = __importDefault(require("express"));
const socket_io_1 = require("socket.io");
const http_1 = __importDefault(require("http"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const Sentry = __importStar(require("@sentry/node"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const helmet_1 = __importDefault(require("helmet"));
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const game_state_1 = require("./server/socket/game-state");
const host_1 = require("./server/socket/host");
const player_1 = require("./server/socket/player");
const screen_1 = require("./server/socket/screen");
const devices_1 = require("./server/socket/devices");
const playlist_collab_1 = require("./server/socket/playlist-collab");
const auth_1 = __importDefault(require("./server/routes/auth"));
const playlists_1 = __importDefault(require("./server/routes/playlists"));
const blindtests_1 = __importDefault(require("./server/routes/blindtests"));
const hardware_1 = __importDefault(require("./server/routes/hardware"));
const PORT = Number(process.env.PORT || 5174);
const DATA_DIR = path_1.default.resolve(process.cwd(), "data");
const GAMES_FILE = path_1.default.join(DATA_DIR, "games.json");
const METRICS_TOKEN = process.env.METRICS_TOKEN || "";
const ENABLE_DB = process.env.ENABLE_DB === "true" ||
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
        if (!origins.includes(localDevOrigin))
            origins.push(localDevOrigin);
        if (!origins.includes(localDevOrigin127))
            origins.push(localDevOrigin127);
    }
    if (origins.length === 0) {
        return [localDevOrigin, localDevOrigin127];
    }
    return origins;
}
const allowedOrigins = parseAllowedOrigins();
// Runtime cache + persistence
const activeGames = {};
// Security & Rate Limiting
const MAX_GAMES = 500;
const gameCreationLimitsBySocket = new Map();
const gameCreationLimitsByIp = new Map();
const buzzRateLimitsBySocket = new Map();
const buzzRateLimitsByIp = new Map();
const ipConnectionCounters = new Map();
const metrics = {
    connectionsTotal: 0,
    rejectedConnections: 0,
    eventsTotal: 0,
    gamesCreated: 0,
};
const connectedDeviceSockets = new Map();
function auditLog(event, data) {
    metrics.eventsTotal += 1;
    if (event === "game:created")
        metrics.gamesCreated += 1;
    console.info(JSON.stringify({
        ts: new Date().toISOString(),
        event,
        ...data,
    }));
}
function ensureDataDir() {
    if (!fs_1.default.existsSync(DATA_DIR)) {
        fs_1.default.mkdirSync(DATA_DIR, { recursive: true });
    }
}
function loadGamesFromDisk() {
    ensureDataDir();
    if (!fs_1.default.existsSync(GAMES_FILE)) {
        return;
    }
    let parsed = {};
    try {
        const raw = fs_1.default.readFileSync(GAMES_FILE, "utf-8");
        parsed = raw ? JSON.parse(raw) : {};
    }
    catch (error) {
        auditLog("game:load_failed", { gameId: "all", error: String(error) });
        return;
    }
    for (const [gameId, state] of Object.entries(parsed)) {
        try {
            activeGames[gameId] = state;
        }
        catch (error) {
            auditLog("game:load_failed", { gameId, error: String(error) });
        }
    }
}
function persistAllGames() {
    ensureDataDir();
    fs_1.default.writeFileSync(GAMES_FILE, JSON.stringify(activeGames), "utf-8");
}
function persistGame(game) {
    activeGames[game.id] = game;
    persistAllGames();
}
function removeGame(gameId) {
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
function enforceGameLimits(socketId, ip) {
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
function isIpAllowed(ip) {
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
    return current.count <= 80;
}
function generateGameCode() {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let code = "";
    for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}
function getRandomColor() {
    const colors = [
        "#ef4444", "#f97316", "#f59e0b", "#84cc16", "#22c55e",
        "#10b981", "#06b6d4", "#0ea5e9", "#3b82f6", "#6366f1",
        "#8b5cf6", "#a855f7", "#d946ef", "#f43f5e"
    ];
    return colors[Math.floor(Math.random() * colors.length)];
}
function shuffleArray(array) {
    const newArray = [...array];
    for (let i = newArray.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
    }
    return newArray;
}
function sanitizeGameState(game) {
    const { hostToken, hostRoles, cohostTokenExpiresAt, ...safeGame } = game;
    const safePlayers = {};
    for (const [id, player] of Object.entries(safeGame.players)) {
        const { playerSecret, ...safePlayer } = player;
        safePlayers[id] = safePlayer;
    }
    return { ...safeGame, players: safePlayers };
}
function getHostRole(game, hostToken) {
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
function hasPermission(role, permission) {
    if (!role)
        return false;
    if (role === "owner")
        return true;
    if (role === "cohost")
        return permission === "control";
    return false;
}
function isAllowedOrigin(originHeader) {
    if (!originHeader)
        return true;
    return allowedOrigins.includes(originHeader);
}
async function startServer() {
    loadGamesFromDisk();
    if (process.env.SENTRY_DSN) {
        Sentry.init({ dsn: process.env.SENTRY_DSN });
    }
    const app = (0, express_1.default)();
    app.use((0, helmet_1.default)({
        contentSecurityPolicy: false,
        crossOriginEmbedderPolicy: false,
        crossOriginOpenerPolicy: false,
    }));
    app.set("trust proxy", 1);
    const apiLimiter = (0, express_rate_limit_1.default)({
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
    const server = http_1.default.createServer(app);
    const io = new socket_io_1.Server(server, {
        cors: {
            origin: (origin, callback) => {
                if (!origin || isAllowedOrigin(origin)) {
                    return callback(null, true);
                }
                return callback(new Error("Origin non autorisée"));
            },
            credentials: true,
        },
    });
    const devicesNamespace = io.of("/devices");
    app.use(express_1.default.json({ limit: "10mb" }));
    app.use((0, cookie_parser_1.default)());
    // Fichiers uploadés (musique, images, vidéos)
    const uploadsDir = path_1.default.resolve(process.cwd(), "uploads");
    if (!fs_1.default.existsSync(uploadsDir)) {
        fs_1.default.mkdirSync(uploadsDir, { recursive: true });
    }
    app.use("/uploads", express_1.default.static(uploadsDir));
    // Routes API (DB optionnelle en développement)
    if (ENABLE_DB) {
        app.use("/api/auth", auth_1.default);
        app.use("/api/playlists", playlists_1.default);
        app.use("/api/blindtests", blindtests_1.default);
        app.use("/api/hardware", hardware_1.default);
    }
    else {
        app.use(["/api/auth", "/api/playlists", "/api/blindtests", "/api/hardware"], (_req, res) => {
            res.status(503).json({
                error: "Base de données désactivée en mode dev. Lance avec ENABLE_DB=true pour activer ces routes.",
            });
        });
    }
    app.get("/api/health", (_req, res) => {
        res.json({ status: "ok" });
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
        };
        (0, host_1.registerHostHandlers)(socketContext);
        (0, player_1.registerPlayerHandlers)(socketContext);
        (0, screen_1.registerScreenHandlers)(socketContext);
        (0, game_state_1.registerGameStateHandlers)(socketContext);
        (0, playlist_collab_1.registerPlaylistCollabHandlers)({ io, socket });
        socket.on("disconnect", () => {
            console.log("Client disconnected:", socket.id);
            buzzRateLimitsBySocket.delete(socket.id);
            gameCreationLimitsBySocket.delete(socket.id);
        });
    });
    devicesNamespace.on("connection", (socket) => {
        const socketIp = socket.handshake.address || "unknown";
        (0, devices_1.registerDeviceHandlers)({
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
    // Vite middleware for development
    if (process.env.NODE_ENV !== "production") {
        const viteModulePath = "vite";
        const { createServer: createViteServer } = await Promise.resolve(`${viteModulePath}`).then(s => __importStar(require(s)));
        const vite = await createViteServer({
            server: { middlewareMode: true },
            appType: "spa",
        });
        app.use(vite.middlewares);
    }
    else {
        app.use(express_1.default.static(path_1.default.resolve(process.cwd(), "dist")));
        app.get("*", (_req, res) => {
            res.sendFile(path_1.default.resolve(process.cwd(), "dist", "index.html"));
        });
    }
    server.listen(PORT, "0.0.0.0", () => {
        console.log(`Server running on http://localhost:${PORT}`);
        console.log(`Database routes: ${ENABLE_DB ? "enabled" : "disabled"}`);
    });
}
startServer();
