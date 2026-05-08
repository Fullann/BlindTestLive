import crypto from "crypto";
import { z } from "zod";
import { Track } from "../../src/types";
import { Ack, ServerGameState, SocketHandlerContext } from "./context";
import { emitLobbyMetaToWatchers } from "./game-state";

const hostJoinSchema = z.object({
  gameId: z.string().min(1).max(10),
  hostToken: z.string().min(10).max(200),
});

const hostReorderTrackSchema = z.object({
  gameId: z.string().min(1).max(10),
  hostToken: z.string().min(10).max(200),
  fromIndex: z.number().int().min(0).max(999),
  toIndex: z.number().int().min(0).max(999),
});

const hostShuffleUpcomingTracksSchema = z.object({
  gameId: z.string().min(1).max(10),
  hostToken: z.string().min(10).max(200),
});

const hostUpdateTrackSchema = z.object({
  gameId: z.string().min(1).max(10),
  hostToken: z.string().min(10).max(200),
  index: z.number().int().min(0).max(999),
  track: z.object({
    title: z.string().min(1).max(100).optional(),
    artist: z.string().max(100).optional(),
    duration: z.number().int().min(1).max(300).optional(),
    mediaType: z.string().max(20).optional(),
    mediaUrl: z.string().max(1000).optional(),
    textContent: z.string().max(2000).optional(),
    startTime: z.number().min(0).optional(),
    url: z.string().max(500).optional(),
    visualHint: z.string().max(500).optional(),
    imageRevealMode: z.enum(["none", "blur"]).optional(),
    imageRevealDuration: z.number().int().min(1).max(300).optional(),
  }),
});

const hostAddTrackSchema = z.object({
  gameId: z.string().min(1).max(10),
  hostToken: z.string().min(10).max(200),
  track: z.object({
    title: z.string().min(1).max(100),
    artist: z.string().max(100).optional(),
    duration: z.number().int().min(1).max(300).optional(),
    mediaType: z.string().max(20).optional(),
    mediaUrl: z.string().max(1000).optional(),
    textContent: z.string().max(2000).optional(),
    startTime: z.number().min(0).optional(),
    url: z.string().max(500).optional(),
    visualHint: z.string().max(500).optional(),
    imageRevealMode: z.enum(["none", "blur"]).optional(),
    imageRevealDuration: z.number().int().min(1).max(300).optional(),
  }),
});

const hostDeleteTrackSchema = z.object({
  gameId: z.string().min(1).max(10),
  hostToken: z.string().min(10).max(200),
  index: z.number().int().min(0).max(999),
});

const hostBulkUpdateUpcomingSchema = z.object({
  gameId: z.string().min(1).max(10),
  hostToken: z.string().min(10).max(200),
  tracks: z
    .array(
      z.object({
        title: z.string().min(1).max(100),
        artist: z.string().max(100).optional(),
        duration: z.number().int().min(1).max(300).optional(),
        mediaType: z.string().max(20).optional(),
        mediaUrl: z.string().max(1000).optional(),
        textContent: z.string().max(2000).optional(),
        startTime: z.number().min(0).optional(),
        url: z.string().max(500).optional(),
        visualHint: z.string().max(500).optional(),
        imageRevealMode: z.enum(["none", "blur"]).optional(),
        imageRevealDuration: z.number().int().min(1).max(300).optional(),
      }),
    )
    .min(1)
    .max(500),
});

const hostAssignTeamSchema = z.object({
  gameId: z.string().min(1).max(10),
  hostToken: z.string().min(10).max(200),
  playerId: z.string().min(1).max(100),
  teamId: z.string().max(32),
});

const hostAddTeamSchema = z.object({
  gameId: z.string().min(1).max(10),
  hostToken: z.string().min(10).max(200),
  name: z.string().min(1).max(32),
  color: z.string().min(1).max(32).optional(),
});

const hostRemoveTeamSchema = z.object({
  gameId: z.string().min(1).max(10),
  hostToken: z.string().min(10).max(200),
  teamId: z.string().min(1).max(32),
});

const hostAssignDeviceSchema = z.object({
  gameId: z.string().min(1).max(10),
  hostToken: z.string().min(10).max(200),
  playerId: z.string().min(1).max(100),
  deviceId: z.string().min(3).max(64),
});

const hostSetDeviceSpeakerSchema = z.object({
  gameId: z.string().min(1).max(10),
  hostToken: z.string().min(10).max(200),
  deviceId: z.string().min(3).max(64),
  speakerEnabled: z.boolean().optional(),
  speakerMuted: z.boolean().optional(),
});

const hostTestDeviceSpeakerSchema = z.object({
  gameId: z.string().min(1).max(10),
  hostToken: z.string().min(10).max(200),
  deviceId: z.string().min(3).max(64),
  pattern: z.enum(["short", "long"]).optional(),
});

const hostRenameDeviceSchema = z.object({
  gameId: z.string().min(1).max(10),
  hostToken: z.string().min(10).max(200),
  deviceId: z.string().min(3).max(64),
  name: z.string().min(1).max(64),
});

const hostUnassignDeviceSchema = z.object({
  gameId: z.string().min(1).max(10),
  hostToken: z.string().min(10).max(200),
  playerId: z.string().min(1).max(100),
});

const hostTestDeviceLedSchema = z.object({
  gameId: z.string().min(1).max(10),
  hostToken: z.string().min(10).max(200),
  deviceId: z.string().min(3).max(64),
  pattern: z.enum(["success", "error", "blink"]).optional(),
});

/** Même périmètre que les champs sanitizés dans host:appendRoundTracks (pas de z.any()). */
const hostAppendRoundTrackSchema = z.object({
  id: z.string().max(50).optional(),
  title: z.string().max(100).optional(),
  artist: z.string().max(100).optional(),
  duration: z.number().optional(),
  mediaType: z.string().max(20).optional(),
  mediaUrl: z.string().max(1000).optional(),
  textContent: z.string().max(2000).optional(),
  startTime: z.number().optional(),
  url: z.string().max(500).optional(),
  visualHint: z.string().max(500).optional(),
  imageRevealMode: z.enum(["none", "blur"]).optional(),
  imageRevealDuration: z.number().int().min(1).max(300).optional(),
});

const hostAppendRoundSchema = z.object({
  gameId: z.string().min(1).max(10),
  hostToken: z.string().min(10).max(200),
  name: z.string().min(1).max(64),
  tracks: z.array(hostAppendRoundTrackSchema).min(1).max(200),
});

const hostSetRoundTextModeSchema = z.object({
  gameId: z.string().min(1).max(10),
  hostToken: z.string().min(10).max(200),
  roundId: z.string().min(1).max(64),
  enabled: z.boolean(),
});

const hostValidateTextAnswerSchema = z.object({
  gameId: z.string().min(1).max(10),
  hostToken: z.string().min(10).max(200),
  answerId: z.string().min(1).max(100),
  playerId: z.string().min(1).max(100),
  isCorrect: z.boolean().optional(),
  points: z.number().int().min(-100).max(100).optional(),
});

const hostStartDuelSchema = z.object({
  gameId: z.string().min(1).max(10),
  hostToken: z.string().min(10).max(200),
  playerAId: z.string().min(1).max(100),
  playerBId: z.string().min(1).max(100),
  rewardPoints: z.number().int().min(1).max(20).optional(),
});

const hostResolveDuelSchema = z.object({
  gameId: z.string().min(1).max(10),
  hostToken: z.string().min(10).max(200),
  winnerId: z.string().min(1).max(100),
});

const hostApplyEventPowerSchema = z.object({
  gameId: z.string().min(1).max(10),
  hostToken: z.string().min(10).max(200),
  power: z.enum(["x2", "freeze", "comeback"]),
  targetPlayerId: z.string().min(1).max(100),
});

const hostUpdateDeviceProfileSchema = z.object({
  gameId: z.string().min(1).max(10),
  hostToken: z.string().min(10).max(200),
  deviceId: z.string().min(3).max(64),
  sensitivity: z.number().int().min(1).max(10).optional(),
  ledStyle: z.enum(["classic", "pulse", "rainbow"]).optional(),
  soundStyle: z.enum(["default", "arcade", "soft"]).optional(),
});

const hostSetSponsorRoundTransitionSchema = z.object({
  gameId: z.string().min(1).max(10),
  hostToken: z.string().min(10).max(200),
  show: z.boolean(),
});

const hostCreateOptionsSchema = z.object({
  isTeamMode: z.boolean().optional(),
  shuffleQuestions: z.boolean().optional(),
  difficulty: z.enum(["easy", "medium", "hard"]).optional(),
  theme: z.enum(["dark", "neon", "retro", "minimal"]).optional(),
  enableBonuses: z.boolean().optional(),
  onboardingEnabled: z.boolean().optional(),
  tutorialSeconds: z.number().int().min(5).max(30).optional(),
  tournamentMode: z.boolean().optional(),
  strictTimerEnabled: z.boolean().optional(),
  rules: z.object({
    wrongAnswerPenalty: z.number().min(-20).max(0).optional(),
    progressiveLock: z.boolean().optional(),
    progressiveLockBaseMs: z.number().int().min(1000).max(20000).optional(),
    antiSpamPenalty: z.number().min(-20).max(0).optional(),
  }).optional(),
  teamConfig: z
    .array(
      z.object({
        id: z.string().min(1).max(32),
        name: z.string().min(1).max(32),
        color: z.string().min(1).max(32),
        enabled: z.boolean(),
      }),
    )
    .optional(),
});

const DEFAULT_TEAM_CONFIG = [
  { id: "red", name: "Equipe Rouge", color: "#ef4444", enabled: true },
  { id: "blue", name: "Equipe Bleue", color: "#3b82f6", enabled: true },
  { id: "green", name: "Equipe Verte", color: "#22c55e", enabled: true },
  { id: "yellow", name: "Equipe Jaune", color: "#eab308", enabled: true },
];

function getDefaultDurationForDifficulty(difficulty: "easy" | "medium" | "hard") {
  if (difficulty === "easy") return 30;
  if (difficulty === "hard") return 12;
  return 20;
}

function logEvent(game: ServerGameState, ctx: SocketHandlerContext, gameId: string, type: string, message: string) {
  if (!game.eventLogs) {
    game.eventLogs = [];
  }
  game.eventLogs.unshift({ ts: Date.now(), type, message });
  game.eventLogs = game.eventLogs.slice(0, 100);
  ctx.io.to(gameId).emit("game:eventLogs", game.eventLogs);
}

function getCurrentTrackStat(game: ServerGameState) {
  if (!Array.isArray(game.playlist) || game.playlist.length === 0) return null;
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
}

async function emitHostsPresence(ctx: SocketHandlerContext, gameId: string) {
  const sockets = await ctx.io.in(gameId).fetchSockets();
  const hosts = sockets
    .filter((s) => s.data?.hostGameId === gameId && (s.data?.hostRole === "owner" || s.data?.hostRole === "cohost"))
    .map((s) => ({
      socketId: s.id,
      role: s.data.hostRole as "owner" | "cohost",
      connectedAt: s.data.hostConnectedAt || Date.now(),
    }));
  ctx.io.to(gameId).emit("game:hostsPresence", hosts);
}

function startCountdown(ctx: SocketHandlerContext, gameId: string, game: ServerGameState, setTrackStartTime = false) {
  game.status = "countdown";
  game.countdown = 3;
  game.buzzedPlayerId = null;
  game.buzzTimestamp = null;
  Object.values(game.players).forEach((p) => (p.lockedOut = false));
  ctx.persistGame(game);
  ctx.io.to(gameId).emit("game:stateUpdate", ctx.sanitizeGameState(game));

  let count = 3;
  const interval = setInterval(() => {
    count--;
    if (ctx.activeGames[gameId] !== game || game.status !== "countdown") {
      clearInterval(interval);
      return;
    }
    if (count <= 0) {
      clearInterval(interval);
      game.status = "playing";
      game.countdown = 0;
      if (setTrackStartTime) {
        game.trackStartTime = Date.now();
      }
      ctx.persistGame(game);
      ctx.io.to(gameId).emit("game:stateUpdate", ctx.sanitizeGameState(game));
    } else {
      game.countdown = count;
      ctx.persistGame(game);
      ctx.io.to(gameId).emit("game:stateUpdate", ctx.sanitizeGameState(game));
    }
  }, 1000);
}


type ParsedHostCreateOptions = {
  isTeamMode: boolean;
  shuffleQuestions: boolean;
  difficulty: "easy" | "medium" | "hard";
  theme: "dark" | "neon" | "retro" | "minimal";
  enableBonuses: boolean;
  onboardingEnabled: boolean;
  tutorialSeconds: number;
  tournamentMode: boolean;
  strictTimerEnabled: boolean;
  rules: {
    wrongAnswerPenalty: number;
    progressiveLock: boolean;
    progressiveLockBaseMs: number;
    antiSpamPenalty: number;
  };
  teamConfig: Array<{ id: string; name: string; color: string; enabled: boolean }>;
};

const DEFAULT_CREATE_OPTIONS: ParsedHostCreateOptions = {
  isTeamMode: false,
  shuffleQuestions: false,
  difficulty: "medium",
  theme: "dark",
  enableBonuses: true,
  onboardingEnabled: true,
  tutorialSeconds: 10,
  tournamentMode: false,
  strictTimerEnabled: false,
  rules: {
    wrongAnswerPenalty: -1,
    progressiveLock: true,
    progressiveLockBaseMs: 5000,
    antiSpamPenalty: -1,
  },
  teamConfig: DEFAULT_TEAM_CONFIG,
};

function mapCreateOptionsFromZod(data: z.infer<typeof hostCreateOptionsSchema>): ParsedHostCreateOptions {
  const safeTeams =
    data.teamConfig?.map((team) => ({
      id: String(team.id).trim().substring(0, 32),
      name: String(team.name).trim().substring(0, 32),
      color: String(team.color).trim().substring(0, 32),
      enabled: !!team.enabled,
    })) || DEFAULT_TEAM_CONFIG;

  return {
    isTeamMode: data.isTeamMode ?? false,
    shuffleQuestions: data.shuffleQuestions ?? false,
    difficulty: data.difficulty ?? "medium",
    theme: data.theme ?? "dark",
    enableBonuses: data.enableBonuses ?? true,
    onboardingEnabled: data.onboardingEnabled ?? true,
    tutorialSeconds: data.tutorialSeconds ?? 10,
    tournamentMode: data.tournamentMode ?? false,
    strictTimerEnabled: data.strictTimerEnabled ?? false,
    rules: {
      wrongAnswerPenalty: data.rules?.wrongAnswerPenalty ?? -1,
      progressiveLock: data.rules?.progressiveLock ?? true,
      progressiveLockBaseMs: data.rules?.progressiveLockBaseMs ?? 5000,
      antiSpamPenalty: data.rules?.antiSpamPenalty ?? -1,
    },
    teamConfig: safeTeams.length > 0 ? safeTeams : DEFAULT_TEAM_CONFIG,
  };
}

/** Options de création : legacy boolean, défauts si absent, ou objet validé strictement (shuffle, règles, etc.). */
function parseHostCreateOptions(rawOptions: unknown): { ok: true; options: ParsedHostCreateOptions } | { ok: false; error: string } {
  if (rawOptions === undefined || rawOptions === null) {
    return { ok: true, options: { ...DEFAULT_CREATE_OPTIONS, teamConfig: [...DEFAULT_TEAM_CONFIG] } };
  }
  if (typeof rawOptions === "boolean") {
    return {
      ok: true,
      options: {
        ...DEFAULT_CREATE_OPTIONS,
        isTeamMode: rawOptions,
        shuffleQuestions: false,
        teamConfig: [...DEFAULT_TEAM_CONFIG],
      },
    };
  }
  if (typeof rawOptions !== "object" || Array.isArray(rawOptions)) {
    return { ok: false, error: "Options de partie invalides" };
  }
  const parsed = hostCreateOptionsSchema.safeParse(rawOptions);
  if (!parsed.success) {
    return { ok: false, error: "Options de partie invalides" };
  }
  return { ok: true, options: mapCreateOptionsFromZod(parsed.data) };
}

export function registerHostHandlers(ctx: SocketHandlerContext) {
  const { socket, socketIp } = ctx;

  socket.on("host:createGame", (playlist: Track[], rawOptions: unknown, callback: Ack) => {
    if (!ctx.enforceGameLimits(socket.id, socketIp)) {
      return callback({ success: false, error: "Trop de parties créées récemment ou limite globale atteinte." });
    }

    if (!Array.isArray(playlist) || playlist.length === 0 || playlist.length > 200) {
      return callback({ success: false, error: "Playlist invalide (max 200 pistes)." });
    }
    const parsedOpts = parseHostCreateOptions(rawOptions);
    if (parsedOpts.ok === false) {
      return callback({ success: false, error: parsedOpts.error });
    }
    const options = parsedOpts.options;
    const defaultTrackDuration = getDefaultDurationForDifficulty(options.difficulty);

    const sanitizedPlaylist = playlist.map((t) => ({
      id: String(t.id).substring(0, 50),
      title: String(t.title).substring(0, 100),
      artist: String(t.artist).substring(0, 100),
      url: t.url ? String(t.url).substring(0, 500) : undefined,
      mediaType: t.mediaType ? (String(t.mediaType).substring(0, 20) as any) : undefined,
      mediaUrl: t.mediaUrl ? String(t.mediaUrl).substring(0, 1000) : undefined,
      textContent: t.textContent ? String(t.textContent).substring(0, 2000) : undefined,
      duration: typeof t.duration === "number" ? Math.max(1, Math.min(300, t.duration)) : defaultTrackDuration,
      startTime: typeof t.startTime === "number" ? Math.max(0, t.startTime) : undefined,
      visualHint: t.visualHint ? String(t.visualHint).substring(0, 500) : undefined,
      imageRevealMode: (t.imageRevealMode === "blur" ? "blur" : "none") as "none" | "blur",
      imageRevealDuration:
        typeof t.imageRevealDuration === "number" ? Math.max(1, Math.min(300, Math.floor(t.imageRevealDuration))) : undefined,
    }));
    const effectivePlaylist = options.shuffleQuestions
      ? ctx.shuffleArray(sanitizedPlaylist)
      : sanitizedPlaylist;

    let code = ctx.generateGameCode();
    while (ctx.activeGames[code]) code = ctx.generateGameCode();

    const hostToken = crypto.randomUUID();

    const newGame: ServerGameState = {
      id: code,
      adminId: socket.id,
      hostToken,
      hostRoles: { [hostToken]: "owner" },
      cohostTokenExpiresAt: {},
      status: "lobby",
      players: {},
      playlist: effectivePlaylist,
      currentTrackIndex: 0,
      buzzedPlayerId: null,
      buzzTimestamp: null,
      isTeamMode: options.isTeamMode,
      difficulty: options.difficulty,
      defaultTrackDuration,
      theme: options.theme,
      enableBonuses: options.enableBonuses,
      onboardingEnabled: options.onboardingEnabled,
      tutorialSeconds: options.tutorialSeconds,
      tournamentMode: options.tournamentMode,
      strictTimerEnabled: options.strictTimerEnabled,
      rules: options.rules,
      teamConfig: options.teamConfig,
      rounds: [{ id: crypto.randomUUID(), name: "Manche 1", startIndex: 0, endIndex: Math.max(0, effectivePlaylist.length - 1), textAnswersEnabled: false }],
      eventLogs: [],
      hostTokenExpiresAt: Date.now() + 12 * 60 * 60 * 1000,
      lastActivity: Date.now(),
    };

    logEvent(newGame, ctx, code, "game_created", `Partie créée (${options.difficulty}, theme ${options.theme})`);
    ctx.activeGames[code] = newGame;
    ctx.persistGame(newGame);
    ctx.auditLog("game:created", { gameId: code, mode: "playlist", bySocket: socket.id, ip: socketIp });
    socket.join(code);
    callback({ success: true, gameId: code, hostToken });
    ctx.io.to(code).emit("game:stateUpdate", ctx.sanitizeGameState(newGame));
  });

  socket.on("host:createYoutubeGame", (youtubeId: string, rawOptions: unknown, callback: Ack) => {
    if (!ctx.enforceGameLimits(socket.id, socketIp)) {
      return callback({ success: false, error: "Trop de parties créées récemment ou limite globale atteinte." });
    }

    if (typeof youtubeId !== "string" || !/^[\w-]{11}$/.test(youtubeId)) {
      return callback({ success: false, error: "ID YouTube invalide." });
    }
    const parsedOpts = parseHostCreateOptions(rawOptions);
    if (parsedOpts.ok === false) {
      return callback({ success: false, error: parsedOpts.error });
    }
    const options = parsedOpts.options;
    let code = ctx.generateGameCode();
    while (ctx.activeGames[code]) code = ctx.generateGameCode();

    const hostToken = crypto.randomUUID();
    const newGame: ServerGameState = {
      id: code,
      adminId: socket.id,
      hostToken,
      hostRoles: { [hostToken]: "owner" },
      cohostTokenExpiresAt: {},
      status: "lobby",
      players: {},
      playlist: [],
      currentTrackIndex: 0,
      buzzedPlayerId: null,
      buzzTimestamp: null,
      youtubeVideoId: youtubeId,
      isTeamMode: options.isTeamMode,
      difficulty: options.difficulty,
      defaultTrackDuration: getDefaultDurationForDifficulty(options.difficulty),
      theme: options.theme,
      enableBonuses: options.enableBonuses,
      onboardingEnabled: options.onboardingEnabled,
      tutorialSeconds: options.tutorialSeconds,
      tournamentMode: options.tournamentMode,
      strictTimerEnabled: options.strictTimerEnabled,
      rules: options.rules,
      teamConfig: options.teamConfig,
      rounds: [{ id: crypto.randomUUID(), name: "Manche 1", startIndex: 0, endIndex: 0, textAnswersEnabled: false }],
      eventLogs: [],
      hostTokenExpiresAt: Date.now() + 12 * 60 * 60 * 1000,
      roundNumber: 1,
      lastActivity: Date.now(),
    };

    logEvent(newGame, ctx, code, "game_created", `Partie YouTube créée (${options.difficulty}, theme ${options.theme})`);
    ctx.activeGames[code] = newGame;
    ctx.persistGame(newGame);
    ctx.auditLog("game:created", { gameId: code, mode: "youtube", bySocket: socket.id, ip: socketIp });
    socket.join(code);
    callback({ success: true, gameId: code, hostToken });
    ctx.io.to(code).emit("game:stateUpdate", ctx.sanitizeGameState(newGame));
  });

  socket.on("host:joinGame", (rawPayload, callback: Ack) => {
    const parsed = hostJoinSchema.safeParse(rawPayload);
    if (!parsed.success) return callback({ success: false, error: "Payload host invalide" });
    const { gameId, hostToken } = parsed.data;
    const game = ctx.activeGames[gameId];
    if (!game) return callback({ success: false, error: "Game not found" });
    const role = ctx.getHostRole(game, hostToken);
    if (!role) return callback({ success: false, error: "Unauthorized" });

    game.adminId = socket.id;
    socket.join(gameId);
    socket.data.hostGameId = gameId;
    socket.data.hostRole = role;
    socket.data.hostConnectedAt = Date.now();
    game.lastActivity = Date.now();
    logEvent(game, ctx, gameId, "host_join", `Un ${role} a rejoint la partie`);
    ctx.persistGame(game);
    callback({ success: true, role });
    socket.emit("game:stateUpdate", ctx.sanitizeGameState(game));
    void emitHostsPresence(ctx, gameId);
  });

  socket.on("host:createCohostToken", (rawPayload, callback: Ack) => {
    const parsed = hostJoinSchema.safeParse(rawPayload);
    if (!parsed.success) return callback({ success: false, error: "Payload invalide" });
    const { gameId, hostToken } = parsed.data;
    const game = ctx.activeGames[gameId];
    if (!game) return callback({ success: false, error: "Game not found" });
    if (!ctx.hasPermission(ctx.getHostRole(game, hostToken), "end")) {
      return callback({ success: false, error: "Permission refusée" });
    }
    const cohostToken = crypto.randomUUID();
    game.hostRoles[cohostToken] = "cohost";
    game.cohostTokenExpiresAt = game.cohostTokenExpiresAt || {};
    game.cohostTokenExpiresAt[cohostToken] = Date.now() + 2 * 60 * 60 * 1000;
    logEvent(game, ctx, gameId, "cohost_created", "Token co-animateur généré");
    ctx.persistGame(game);
    callback({ success: true, cohostToken });
  });

  socket.on("host:startTrack", ({ gameId, hostToken }, callback: Ack) => {
    const game = ctx.activeGames[gameId];
    const role = game ? ctx.getHostRole(game, hostToken) : null;
    if (game && ctx.hasPermission(role, "control")) {
      game.lastActivity = Date.now();
      const track = game.playlist[game.currentTrackIndex];
      if (track && !track.duration) {
        track.duration = game.defaultTrackDuration || 20;
      }
      const currentTrackStat = getCurrentTrackStat(game);
      if (currentTrackStat) {
        currentTrackStat.playedCount += 1;
        currentTrackStat.title = track?.title || currentTrackStat.title;
        currentTrackStat.artist = track?.artist || currentTrackStat.artist;
        currentTrackStat.trackId = track?.id || currentTrackStat.trackId;
      }
      logEvent(game, ctx, gameId, "track_start", "Manche démarrée");
      // Le tutoriel (onboarding) est maintenant affiché côté joueurs pendant le lobby
      // (avant que l'hôte clique sur "Lancer"), donc on démarre directement le décompte
      // sans phase bloquante de 10 s. La phase "onboarding" reste disponible si elle est
      // déclenchée manuellement depuis un autre statut.
      startCountdown(ctx, gameId, game, true);
      callback({ success: true });
    } else {
      callback({ success: false, error: "Permission refusée" });
    }
  });

  socket.on("host:awardPoints", ({ gameId, playerId, points, hostToken }, callback: Ack) => {
    const game = ctx.activeGames[gameId];
    const role = game ? ctx.getHostRole(game, hostToken) : null;
    if (game && ctx.hasPermission(role, "control")) {
      game.lastActivity = Date.now();
      const player = game.players[playerId];
      if (player) {
        const safePoints = typeof points === "number" ? Math.max(-100, Math.min(100, points)) : 1;
        player.combo = (player.combo || 0) + 1;
        const comboBonus = game.enableBonuses ? Math.min(player.combo - 1, 3) : 0;
        let awarded = game.enableBonuses ? safePoints + comboBonus : 1;
        if (game.enableBonuses && player.doublePointsArmed) {
          awarded = awarded * 2;
          player.doublePointsArmed = false;
        }
        if (player.eventPowerDoubleNext) {
          awarded = awarded * 2;
          player.eventPowerDoubleNext = false;
        }
        player.score += awarded;
        player.stats = player.stats || { buzzes: 0, correctAnswers: 0, wrongAnswers: 0 };
        player.stats.correctAnswers += 1;
        const currentTrackStat = getCurrentTrackStat(game);
        if (currentTrackStat) {
          currentTrackStat.correctAnswers += 1;
        }
        logEvent(game, ctx, gameId, "points_awarded", `${player.name} gagne ${awarded} pts (combo x${player.combo})`);
      }
      game.status = "revealed";
      if (game.youtubeVideoId) game.roundNumber = (game.roundNumber || 1) + 1;
      ctx.persistGame(game);
      ctx.io.to(gameId).emit("game:playSound", "correct");
      ctx.io.to(gameId).emit("game:stateUpdate", ctx.sanitizeGameState(game));
      callback({ success: true });
    } else {
      callback({ success: false, error: "Permission refusée" });
    }
  });

  socket.on("host:penalize", ({ gameId, playerId, hostToken }, callback: Ack) => {
    const game = ctx.activeGames[gameId];
    const role = game ? ctx.getHostRole(game, hostToken) : null;
    if (game && ctx.hasPermission(role, "control")) {
      game.lastActivity = Date.now();
      Object.values(game.players).forEach((p) => {
        if (p.id !== playerId) p.lockedOut = false;
      });
      if (game.players[playerId]) {
        game.players[playerId].lockedOut = true;
        game.players[playerId].combo = 0;
        const wrongPenalty = game.rules?.wrongAnswerPenalty ?? -1;
        game.players[playerId].score += wrongPenalty;
        game.players[playerId].stats = game.players[playerId].stats || { buzzes: 0, correctAnswers: 0, wrongAnswers: 0 };
        game.players[playerId].stats!.wrongAnswers += 1;
        const currentTrackStat = getCurrentTrackStat(game);
        if (currentTrackStat) {
          currentTrackStat.wrongAnswers += 1;
        }
        logEvent(game, ctx, gameId, "player_penalized", `${game.players[playerId].name} pénalisé`);
        if (game.rules?.progressiveLock) {
          const mistakes = game.players[playerId].stats?.wrongAnswers || 1;
          const lockMs = Math.min(30000, (game.rules?.progressiveLockBaseMs || 5000) * mistakes);
          setTimeout(() => {
            const currentGame = ctx.activeGames[gameId];
            const currentPlayer = currentGame?.players[playerId];
            if (!currentGame || !currentPlayer) return;
            currentPlayer.lockedOut = false;
            ctx.persistGame(currentGame);
            ctx.io.to(gameId).emit("game:stateUpdate", ctx.sanitizeGameState(currentGame));
          }, lockMs);
        }
      }
      if (game.trackStartTime && game.buzzTimestamp) {
        game.trackStartTime += Date.now() - game.buzzTimestamp;
      }
      game.status = "playing";
      game.buzzedPlayerId = null;
      game.buzzTimestamp = null;
      ctx.persistGame(game);
      ctx.io.to(gameId).emit("game:playSound", "wrong");
      ctx.io.to(gameId).emit("game:stateUpdate", ctx.sanitizeGameState(game));
      callback({ success: true });
    } else {
      callback({ success: false, error: "Permission refusée" });
    }
  });

  socket.on("host:adjustScore", (rawPayload, callback: Ack) => {
    const parsed = z
      .object({
        gameId: z.string().min(1).max(10),
        hostToken: z.string().min(1),
        playerId: z.string().min(1).max(100),
        delta: z.number().int().min(-100).max(100),
      })
      .safeParse(rawPayload);
    if (!parsed.success) return callback({ success: false, error: "Payload invalide" });
    const { gameId, hostToken, playerId, delta } = parsed.data;
    const game = ctx.activeGames[gameId];
    const role = game ? ctx.getHostRole(game, hostToken) : null;
    if (!game || !ctx.hasPermission(role, "control")) {
      return callback({ success: false, error: "Permission refusée" });
    }
    const player = game.players[playerId];
    if (!player) return callback({ success: false, error: "Joueur introuvable" });
    player.score += delta;
    game.lastActivity = Date.now();
    const sign = delta >= 0 ? "+" : "";
    logEvent(game, ctx, gameId, "score_adjusted", `${player.name} : ajustement manuel ${sign}${delta} pt(s)`);
    ctx.persistGame(game);
    ctx.io.to(gameId).emit("game:stateUpdate", ctx.sanitizeGameState(game));
    callback({ success: true });
  });

  socket.on("host:unlockPlayer", ({ gameId, playerId, hostToken }, callback: Ack) => {
    const game = ctx.activeGames[gameId];
    const role = game ? ctx.getHostRole(game, hostToken) : null;
    if (game && ctx.hasPermission(role, "control")) {
      if (game.players[playerId]) {
        game.players[playerId].lockedOut = false;
        logEvent(game, ctx, gameId, "player_unlocked", `${game.players[playerId].name} débloqué`);
        ctx.persistGame(game);
        ctx.io.to(gameId).emit("game:stateUpdate", ctx.sanitizeGameState(game));
      }
      callback({ success: true });
    } else {
      callback({ success: false, error: "Permission refusée" });
    }
  });

  socket.on("host:endGame", ({ gameId, hostToken }, callback: Ack) => {
    const game = ctx.activeGames[gameId];
    const role = game ? ctx.getHostRole(game, hostToken) : null;
    if (game && ctx.hasPermission(role, "end")) {
      game.lastActivity = Date.now();
      game.status = "finished";
      game.hostRoles = {};
      game.cohostTokenExpiresAt = {};
      game.hostToken = "";
      logEvent(game, ctx, gameId, "game_end", "Partie terminée");
      ctx.persistGame(game);
      void ctx.persistFinishedGameAnalytics?.(game, "host_end");
      ctx.auditLog("game:ended", { gameId, byRole: role, bySocket: socket.id });
      ctx.io.to(gameId).emit("game:stateUpdate", ctx.sanitizeGameState(game));
      callback({ success: true });
    } else {
      callback({ success: false, error: "Permission refusée" });
    }
  });

  socket.on("host:kickPlayer", ({ gameId, playerId, hostToken }, callback: Ack) => {
    const game = ctx.activeGames[gameId];
    const role = game ? ctx.getHostRole(game, hostToken) : null;
    if (game && ctx.hasPermission(role, "kick")) {
      if (game.players[playerId]) {
        const playerSocketId = game.players[playerId].socketId;
        const playerName = game.players[playerId].name;
        delete game.players[playerId];
        logEvent(game, ctx, gameId, "player_kicked", `${playerName} a été exclu`);
        ctx.persistGame(game);
        ctx.auditLog("player:kicked", { gameId, playerId, byRole: role, bySocket: socket.id });
        ctx.io.to(playerSocketId).emit("player:kicked");
        ctx.io.to(playerSocketId).emit("player:forceLogout");
        ctx.io.to(gameId).emit("game:stateUpdate", ctx.sanitizeGameState(game));
      }
      callback({ success: true });
    } else {
      callback({ success: false, error: "Permission refusée" });
    }
  });

  socket.on("host:revealAnswer", ({ gameId, hostToken }, callback: Ack) => {
    const game = ctx.activeGames[gameId];
    const role = game ? ctx.getHostRole(game, hostToken) : null;
    if (game && ctx.hasPermission(role, "control")) {
      game.lastActivity = Date.now();
      if (!game.buzzedPlayerId) {
        const currentTrackStat = getCurrentTrackStat(game);
        if (currentTrackStat) {
          currentTrackStat.revealedWithoutAnswer += 1;
        }
      }
      game.status = "revealed";
      if (game.youtubeVideoId) game.roundNumber = (game.roundNumber || 1) + 1;
      logEvent(game, ctx, gameId, "answer_revealed", "Réponse révélée");
      ctx.persistGame(game);
      ctx.io.to(gameId).emit("game:stateUpdate", ctx.sanitizeGameState(game));
      callback({ success: true });
    } else {
      callback({ success: false, error: "Permission refusée" });
    }
  });

  socket.on("host:resumeYoutube", ({ gameId, hostToken }, callback: Ack) => {
    const game = ctx.activeGames[gameId];
    const role = game ? ctx.getHostRole(game, hostToken) : null;
    if (game && ctx.hasPermission(role, "control")) {
      logEvent(game, ctx, gameId, "youtube_resume", "Reprise YouTube");
      startCountdown(ctx, gameId, game, false);
      callback({ success: true });
    } else {
      callback({ success: false, error: "Permission refusée" });
    }
  });

  socket.on("host:nextTrack", ({ gameId, hostToken }, callback: Ack) => {
    const game = ctx.activeGames[gameId];
    const role = game ? ctx.getHostRole(game, hostToken) : null;
    if (game && ctx.hasPermission(role, "control")) {
      game.lastActivity = Date.now();
      if (game.currentTrackIndex < game.playlist.length - 1) {
        game.currentTrackIndex++;
        if (Array.isArray(game.rounds)) {
          const roundIndex = game.rounds.findIndex(
            (round) => game.currentTrackIndex >= round.startIndex && game.currentTrackIndex <= round.endIndex,
          );
          if (roundIndex >= 0) game.roundNumber = roundIndex + 1;
        }
        logEvent(game, ctx, gameId, "next_track", `Piste ${game.currentTrackIndex + 1}`);
        startCountdown(ctx, gameId, game, true);
      } else {
        game.status = "finished";
        logEvent(game, ctx, gameId, "game_end", game.tournamentMode ? "Grande finale terminée" : "Fin de playlist");
        ctx.persistGame(game);
        void ctx.persistFinishedGameAnalytics?.(game, "playlist_end");
        ctx.io.to(gameId).emit("game:stateUpdate", ctx.sanitizeGameState(game));
      }
      callback({ success: true });
    } else {
      callback({ success: false, error: "Permission refusée" });
    }
  });

  socket.on("host:setSponsorRoundTransition", (rawPayload, callback: Ack) => {
    const parsed = hostSetSponsorRoundTransitionSchema.safeParse(rawPayload);
    if (!parsed.success) {
      return callback({ success: false, error: "Payload invalide" });
    }
    const { gameId, hostToken, show } = parsed.data;
    const game = ctx.activeGames[gameId];
    const role = game ? ctx.getHostRole(game, hostToken) : null;
    if (!game || !ctx.hasPermission(role, "control")) {
      return callback({ success: false, error: "Permission refusée" });
    }
    game.showSponsorRoundTransition = show;
    game.lastActivity = Date.now();
    ctx.persistGame(game);
    ctx.io.to(gameId).emit("game:stateUpdate", ctx.sanitizeGameState(game));
    logEvent(game, ctx, gameId, "screen_option", show ? "Transition sponsor écran public : activée" : "Transition sponsor écran public : désactivée");
    callback({ success: true });
  });

  socket.on("host:reorderTrack", (rawPayload, callback: Ack) => {
    const parsed = hostReorderTrackSchema.safeParse(rawPayload);
    if (!parsed.success) {
      return callback({ success: false, error: "Payload invalide" });
    }

    const { gameId, hostToken, fromIndex, toIndex } = parsed.data;
    const game = ctx.activeGames[gameId];
    const role = game ? ctx.getHostRole(game, hostToken) : null;
    if (!game || !ctx.hasPermission(role, "control")) {
      return callback({ success: false, error: "Permission refusée" });
    }
    if (!Array.isArray(game.playlist) || game.playlist.length <= 1) {
      return callback({ success: false, error: "Playlist insuffisante" });
    }
    if (
      fromIndex < 0 ||
      toIndex < 0 ||
      fromIndex >= game.playlist.length ||
      toIndex >= game.playlist.length ||
      fromIndex === toIndex
    ) {
      return callback({ success: false, error: "Indices invalides" });
    }

    const currentTrack = game.playlist[game.currentTrackIndex];
    const [movedTrack] = game.playlist.splice(fromIndex, 1);
    game.playlist.splice(toIndex, 0, movedTrack);

    const nextCurrentIndex = game.playlist.findIndex((track) => track.id === currentTrack?.id);
    game.currentTrackIndex = nextCurrentIndex >= 0 ? nextCurrentIndex : game.currentTrackIndex;
    game.lastActivity = Date.now();
    logEvent(game, ctx, gameId, "playlist_reorder", `Piste déplacée ${fromIndex + 1} -> ${toIndex + 1}`);
    ctx.persistGame(game);
    ctx.io.to(gameId).emit("game:stateUpdate", ctx.sanitizeGameState(game));
    callback({ success: true });
  });

  socket.on("host:shuffleUpcomingTracks", (rawPayload, callback: Ack) => {
    const parsed = hostShuffleUpcomingTracksSchema.safeParse(rawPayload);
    if (!parsed.success) {
      return callback({ success: false, error: "Payload invalide" });
    }

    const { gameId, hostToken } = parsed.data;
    const game = ctx.activeGames[gameId];
    const role = game ? ctx.getHostRole(game, hostToken) : null;
    if (!game || !ctx.hasPermission(role, "control")) {
      return callback({ success: false, error: "Permission refusée" });
    }
    if (!Array.isArray(game.playlist) || game.playlist.length <= 1) {
      return callback({ success: false, error: "Playlist insuffisante" });
    }

    const startIndex = Math.max(0, game.currentTrackIndex + 1);
    if (startIndex >= game.playlist.length - 1) {
      return callback({ success: false, error: "Pas assez de questions à mélanger" });
    }

    const currentAndPast = game.playlist.slice(0, startIndex);
    const upcoming = game.playlist.slice(startIndex);
    const shuffled = ctx.shuffleArray(upcoming);
    game.playlist = [...currentAndPast, ...shuffled];
    game.lastActivity = Date.now();

    logEvent(game, ctx, gameId, "playlist_shuffle", `Questions à venir mélangées (${shuffled.length})`);
    ctx.persistGame(game);
    ctx.io.to(gameId).emit("game:stateUpdate", ctx.sanitizeGameState(game));
    callback({ success: true, shuffledCount: shuffled.length });
  });

  socket.on("host:updateTrack", (rawPayload, callback: Ack) => {
    const parsed = hostUpdateTrackSchema.safeParse(rawPayload);
    if (!parsed.success) return callback({ success: false, error: "Payload invalide" });
    const { gameId, hostToken, index, track } = parsed.data;
    const game = ctx.activeGames[gameId];
    const role = game ? ctx.getHostRole(game, hostToken) : null;
    if (!game || !ctx.hasPermission(role, "control")) return callback({ success: false, error: "Permission refusée" });
    if (!Array.isArray(game.playlist) || index < 0 || index >= game.playlist.length) {
      return callback({ success: false, error: "Question introuvable" });
    }
    if (
      index === game.currentTrackIndex &&
      (game.status === "countdown" || game.status === "playing" || game.status === "paused")
    ) {
      return callback({ success: false, error: "Impossible de modifier la question en cours" });
    }

    const existing = game.playlist[index];
    game.playlist[index] = {
      ...existing,
      title: track.title !== undefined ? String(track.title).substring(0, 100) : existing.title,
      artist: track.artist !== undefined ? String(track.artist).substring(0, 100) : existing.artist,
      duration: typeof track.duration === "number" ? Math.max(1, Math.min(300, track.duration)) : existing.duration,
      mediaType: track.mediaType !== undefined ? (String(track.mediaType).substring(0, 20) as any) : existing.mediaType,
      mediaUrl: track.mediaUrl !== undefined ? String(track.mediaUrl).substring(0, 1000) : existing.mediaUrl,
      textContent: track.textContent !== undefined ? String(track.textContent).substring(0, 2000) : existing.textContent,
      startTime: typeof track.startTime === "number" ? Math.max(0, track.startTime) : existing.startTime,
      url: track.url !== undefined ? String(track.url).substring(0, 500) : existing.url,
      visualHint: track.visualHint !== undefined ? String(track.visualHint).substring(0, 500) : existing.visualHint,
      imageRevealMode: track.imageRevealMode !== undefined ? ((track.imageRevealMode === "blur" ? "blur" : "none") as "none" | "blur") : existing.imageRevealMode,
      imageRevealDuration:
        typeof track.imageRevealDuration === "number"
          ? Math.max(1, Math.min(300, Math.floor(track.imageRevealDuration)))
          : existing.imageRevealDuration,
    };
    game.lastActivity = Date.now();
    logEvent(game, ctx, gameId, "track_updated", `Question #${index + 1} modifiée`);
    ctx.persistGame(game);
    ctx.io.to(gameId).emit("game:stateUpdate", ctx.sanitizeGameState(game));
    callback({ success: true });
  });

  socket.on("host:addTrack", (rawPayload, callback: Ack) => {
    const parsed = hostAddTrackSchema.safeParse(rawPayload);
    if (!parsed.success) return callback({ success: false, error: "Payload invalide" });
    const { gameId, hostToken, track } = parsed.data;
    const game = ctx.activeGames[gameId];
    const role = game ? ctx.getHostRole(game, hostToken) : null;
    if (!game || !ctx.hasPermission(role, "control")) return callback({ success: false, error: "Permission refusée" });
    if (game.youtubeVideoId) return callback({ success: false, error: "Mode YouTube non compatible" });
    if (game.playlist.length >= 500) return callback({ success: false, error: "Limite de questions atteinte (500)" });

    game.playlist.push({
      id: crypto.randomUUID().substring(0, 50),
      title: String(track.title).substring(0, 100),
      artist: String(track.artist || "").substring(0, 100),
      mediaType: track.mediaType ? (String(track.mediaType).substring(0, 20) as any) : "audio",
      mediaUrl: track.mediaUrl ? String(track.mediaUrl).substring(0, 1000) : undefined,
      textContent: track.textContent ? String(track.textContent).substring(0, 2000) : undefined,
      duration: typeof track.duration === "number" ? Math.max(1, Math.min(300, track.duration)) : (game.defaultTrackDuration || 20),
      startTime: typeof track.startTime === "number" ? Math.max(0, track.startTime) : undefined,
      url: track.url ? String(track.url).substring(0, 500) : undefined,
      visualHint: track.visualHint ? String(track.visualHint).substring(0, 500) : undefined,
      imageRevealMode: (track.imageRevealMode === "blur" ? "blur" : "none") as "none" | "blur",
      imageRevealDuration:
        typeof track.imageRevealDuration === "number"
          ? Math.max(1, Math.min(300, Math.floor(track.imageRevealDuration)))
          : undefined,
    });
    game.lastActivity = Date.now();
    logEvent(game, ctx, gameId, "track_added", `Question ajoutée: ${String(track.title).substring(0, 100)}`);
    ctx.persistGame(game);
    ctx.io.to(gameId).emit("game:stateUpdate", ctx.sanitizeGameState(game));
    callback({ success: true, index: game.playlist.length - 1 });
  });

  socket.on("host:deleteTrack", (rawPayload, callback: Ack) => {
    const parsed = hostDeleteTrackSchema.safeParse(rawPayload);
    if (!parsed.success) return callback({ success: false, error: "Payload invalide" });
    const { gameId, hostToken, index } = parsed.data;
    const game = ctx.activeGames[gameId];
    const role = game ? ctx.getHostRole(game, hostToken) : null;
    if (!game || !ctx.hasPermission(role, "control")) return callback({ success: false, error: "Permission refusée" });
    if (!Array.isArray(game.playlist) || index < 0 || index >= game.playlist.length) {
      return callback({ success: false, error: "Question introuvable" });
    }
    if (game.playlist.length <= 1) return callback({ success: false, error: "Impossible de supprimer la dernière question" });
    if (
      index === game.currentTrackIndex &&
      (game.status === "countdown" || game.status === "playing" || game.status === "paused")
    ) {
      return callback({ success: false, error: "Impossible de supprimer la question en cours" });
    }
    const removed = game.playlist[index];
    game.playlist.splice(index, 1);
    if (index < game.currentTrackIndex) {
      game.currentTrackIndex = Math.max(0, game.currentTrackIndex - 1);
    } else if (game.currentTrackIndex >= game.playlist.length) {
      game.currentTrackIndex = Math.max(0, game.playlist.length - 1);
    }
    game.lastActivity = Date.now();
    logEvent(game, ctx, gameId, "track_deleted", `Question supprimée: ${removed?.title || `#${index + 1}`}`);
    ctx.persistGame(game);
    ctx.io.to(gameId).emit("game:stateUpdate", ctx.sanitizeGameState(game));
    callback({ success: true });
  });

  socket.on("host:bulkUpdateUpcomingTracks", (rawPayload, callback: Ack) => {
    const parsed = hostBulkUpdateUpcomingSchema.safeParse(rawPayload);
    if (!parsed.success) return callback({ success: false, error: "Payload invalide" });
    const { gameId, hostToken, tracks } = parsed.data;
    const game = ctx.activeGames[gameId];
    const role = game ? ctx.getHostRole(game, hostToken) : null;
    if (!game || !ctx.hasPermission(role, "control")) return callback({ success: false, error: "Permission refusée" });
    if (game.youtubeVideoId) return callback({ success: false, error: "Mode YouTube non compatible" });
    if (!Array.isArray(game.playlist) || game.playlist.length === 0) {
      return callback({ success: false, error: "Playlist introuvable" });
    }
    // On conserve la question courante, on remplace uniquement les questions suivantes.
    const current = game.playlist.slice(0, game.currentTrackIndex + 1);
    const sanitizedUpcoming: Track[] = tracks.map((t) => ({
      id: crypto.randomUUID().substring(0, 50),
      title: String(t.title).substring(0, 100),
      artist: String(t.artist || "").substring(0, 100),
      duration: typeof t.duration === "number" ? Math.max(1, Math.min(300, t.duration)) : game.defaultTrackDuration || 20,
      mediaType: t.mediaType ? (String(t.mediaType).substring(0, 20) as any) : "audio",
      mediaUrl: t.mediaUrl ? String(t.mediaUrl).substring(0, 1000) : undefined,
      textContent: t.textContent ? String(t.textContent).substring(0, 2000) : undefined,
      startTime: typeof t.startTime === "number" ? Math.max(0, t.startTime) : undefined,
      url: t.url ? String(t.url).substring(0, 500) : undefined,
      visualHint: t.visualHint ? String(t.visualHint).substring(0, 500) : undefined,
      imageRevealMode: (t.imageRevealMode === "blur" ? "blur" : "none") as "none" | "blur",
      imageRevealDuration:
        typeof t.imageRevealDuration === "number"
          ? Math.max(1, Math.min(300, Math.floor(t.imageRevealDuration)))
          : undefined,
    }));
    game.playlist = [...current, ...sanitizedUpcoming];
    game.lastActivity = Date.now();
    logEvent(game, ctx, gameId, "tracks_bulk_update", `${sanitizedUpcoming.length} questions à venir mises à jour`);
    ctx.persistGame(game);
    ctx.io.to(gameId).emit("game:stateUpdate", ctx.sanitizeGameState(game));
    callback({ success: true });
  });

  socket.on("host:assignPlayerTeam", (rawPayload, callback: Ack) => {
    const parsed = hostAssignTeamSchema.safeParse(rawPayload);
    if (!parsed.success) return callback({ success: false, error: "Payload invalide" });
    const { gameId, hostToken, playerId, teamId } = parsed.data;
    const game = ctx.activeGames[gameId];
    const role = game ? ctx.getHostRole(game, hostToken) : null;
    if (!game || !ctx.hasPermission(role, "control")) return callback({ success: false, error: "Permission refusée" });
    const player = game.players[playerId];
    if (!player) return callback({ success: false, error: "Joueur introuvable" });
    if (!teamId) {
      player.team = undefined;
      game.lastActivity = Date.now();
      logEvent(game, ctx, gameId, "team_change", `${player.name} n'est plus assigné à une équipe`);
      ctx.persistGame(game);
      ctx.io.to(gameId).emit("game:stateUpdate", ctx.sanitizeGameState(game));
      return callback({ success: true });
    }
    const enabledTeam = (game.teamConfig || []).find((team) => team.id === teamId && team.enabled);
    if (!enabledTeam) return callback({ success: false, error: "Equipe invalide" });
    player.team = enabledTeam.id;
    game.lastActivity = Date.now();
    logEvent(game, ctx, gameId, "team_change", `${player.name} rejoint ${enabledTeam.name}`);
    ctx.persistGame(game);
    ctx.io.to(gameId).emit("game:stateUpdate", ctx.sanitizeGameState(game));
    callback({ success: true });
  });

  socket.on("host:addTeam", (rawPayload, callback: Ack) => {
    const parsed = hostAddTeamSchema.safeParse(rawPayload);
    if (!parsed.success) return callback({ success: false, error: "Payload invalide" });
    const { gameId, hostToken, name, color } = parsed.data;
    const game = ctx.activeGames[gameId];
    const role = game ? ctx.getHostRole(game, hostToken) : null;
    if (!game || !ctx.hasPermission(role, "control")) return callback({ success: false, error: "Permission refusée" });

    const teamName = name.trim().substring(0, 32);
    if (!teamName) return callback({ success: false, error: "Nom d'équipe invalide" });
    game.teamConfig = game.teamConfig || [...DEFAULT_TEAM_CONFIG];
    if (game.teamConfig.length >= 20) return callback({ success: false, error: "Maximum 20 équipes" });
    const teamId = `team_${crypto.randomUUID().replace(/-/g, "").slice(0, 8)}`;
    game.teamConfig.push({
      id: teamId,
      name: teamName,
      color: (color || "#a855f7").substring(0, 32),
      enabled: true,
    });
    game.isTeamMode = true;
    game.lastActivity = Date.now();
    logEvent(game, ctx, gameId, "team_added", `Equipe ajoutée: ${teamName}`);
    ctx.persistGame(game);
    ctx.io.to(gameId).emit("game:stateUpdate", ctx.sanitizeGameState(game));
    emitLobbyMetaToWatchers(ctx.io, gameId, game);
    callback({ success: true, teamId });
  });

  socket.on("host:removeTeam", (rawPayload, callback: Ack) => {
    const parsed = hostRemoveTeamSchema.safeParse(rawPayload);
    if (!parsed.success) return callback({ success: false, error: "Payload invalide" });
    const { gameId, hostToken, teamId } = parsed.data;
    const game = ctx.activeGames[gameId];
    const role = game ? ctx.getHostRole(game, hostToken) : null;
    if (!game || !ctx.hasPermission(role, "control")) return callback({ success: false, error: "Permission refusée" });
    game.teamConfig = game.teamConfig || [...DEFAULT_TEAM_CONFIG];
    const team = game.teamConfig.find((entry) => entry.id === teamId);
    if (!team) return callback({ success: false, error: "Equipe introuvable" });

    game.teamConfig = game.teamConfig.filter((entry) => entry.id !== teamId);
    Object.values(game.players).forEach((player) => {
      if (player.team === teamId) player.team = undefined;
    });
    if (game.teamConfig.length === 0) {
      game.isTeamMode = false;
    }
    game.lastActivity = Date.now();
    logEvent(game, ctx, gameId, "team_removed", `Equipe supprimée: ${team.name}`);
    ctx.persistGame(game);
    ctx.io.to(gameId).emit("game:stateUpdate", ctx.sanitizeGameState(game));
    emitLobbyMetaToWatchers(ctx.io, gameId, game);
    callback({ success: true });
  });

  socket.on("host:assignDevice", (rawPayload, callback: Ack) => {
    const parsed = hostAssignDeviceSchema.safeParse(rawPayload);
    if (!parsed.success) return callback({ success: false, error: "Payload invalide" });
    const { gameId, hostToken, playerId, deviceId } = parsed.data;
    const game = ctx.activeGames[gameId];
    const role = game ? ctx.getHostRole(game, hostToken) : null;
    if (!game || !ctx.hasPermission(role, "control")) return callback({ success: false, error: "Permission refusée" });
    const player = game.players[playerId];
    if (!player) return callback({ success: false, error: "Joueur introuvable" });

    game.hardwareDevices = game.hardwareDevices || {};
    const previousPlayer = Object.values(game.players).find((entry) => entry.buzzerDeviceId === deviceId);
    if (previousPlayer) previousPlayer.buzzerDeviceId = undefined;
    player.buzzerDeviceId = deviceId;
    player.deviceType = "esp32";

    game.hardwareDevices[deviceId] = {
      id: deviceId,
      name: game.hardwareDevices[deviceId]?.name || deviceId,
      gameId,
      playerId,
      status: game.hardwareDevices[deviceId]?.status || "offline",
      lastSeenAt: Date.now(),
      firmware: game.hardwareDevices[deviceId]?.firmware,
      rssi: game.hardwareDevices[deviceId]?.rssi,
      speakerEnabled: game.hardwareDevices[deviceId]?.speakerEnabled ?? true,
      speakerMuted: game.hardwareDevices[deviceId]?.speakerMuted ?? false,
      sensitivity: game.hardwareDevices[deviceId]?.sensitivity ?? 5,
      ledStyle: game.hardwareDevices[deviceId]?.ledStyle ?? "classic",
      soundStyle: game.hardwareDevices[deviceId]?.soundStyle ?? "default",
    };
    game.lastActivity = Date.now();
    logEvent(game, ctx, gameId, "device_assigned", `${player.name} relié au buzzer ${deviceId}`);
    ctx.persistGame(game);
    ctx.io.to(gameId).emit("game:hardwareUpdate", game.hardwareDevices);
    ctx.io.to(gameId).emit("game:stateUpdate", ctx.sanitizeGameState(game));
    callback({ success: true });
  });

  socket.on("host:setDeviceSpeaker", (rawPayload, callback: Ack) => {
    const parsed = hostSetDeviceSpeakerSchema.safeParse(rawPayload);
    if (!parsed.success) return callback({ success: false, error: "Payload invalide" });
    const { gameId, hostToken, deviceId, speakerEnabled, speakerMuted } = parsed.data;
    const game = ctx.activeGames[gameId];
    const role = game ? ctx.getHostRole(game, hostToken) : null;
    if (!game || !ctx.hasPermission(role, "control")) return callback({ success: false, error: "Permission refusée" });
    game.hardwareDevices = game.hardwareDevices || {};
    if (!game.hardwareDevices[deviceId]) {
      game.hardwareDevices[deviceId] = {
        id: deviceId,
        name: deviceId,
        status: "offline",
        lastSeenAt: Date.now(),
        sensitivity: 5,
        ledStyle: "classic",
        soundStyle: "default",
      };
    }
    if (typeof speakerEnabled === "boolean") game.hardwareDevices[deviceId].speakerEnabled = speakerEnabled;
    if (typeof speakerMuted === "boolean") game.hardwareDevices[deviceId].speakerMuted = speakerMuted;
    game.lastActivity = Date.now();
    logEvent(game, ctx, gameId, "speaker_update", `Haut-parleur ${deviceId} mis à jour`);
    ctx.persistGame(game);
    ctx.io.to(gameId).emit("game:hardwareUpdate", game.hardwareDevices);
    ctx.io.to(gameId).emit("game:stateUpdate", ctx.sanitizeGameState(game));
    ctx.io.of("/devices").to(`device:${deviceId}`).emit("device:speaker", {
      deviceId,
      speakerEnabled: game.hardwareDevices[deviceId].speakerEnabled ?? true,
      speakerMuted: game.hardwareDevices[deviceId].speakerMuted ?? false,
      command: "sync",
    });
    callback({ success: true });
  });

  socket.on("host:testDeviceSpeaker", (rawPayload, callback: Ack) => {
    const parsed = hostTestDeviceSpeakerSchema.safeParse(rawPayload);
    if (!parsed.success) return callback({ success: false, error: "Payload invalide" });
    const { gameId, hostToken, deviceId, pattern } = parsed.data;
    const game = ctx.activeGames[gameId];
    const role = game ? ctx.getHostRole(game, hostToken) : null;
    if (!game || !ctx.hasPermission(role, "control")) return callback({ success: false, error: "Permission refusée" });
    const hardware = game.hardwareDevices?.[deviceId];
    if (hardware?.speakerEnabled === false) {
      return callback({ success: false, error: "Haut-parleur désactivé" });
    }
    if (hardware?.speakerMuted) {
      return callback({ success: false, error: "Haut-parleur muté" });
    }
    ctx.io.of("/devices").to(`device:${deviceId}`).emit("device:speaker", {
      deviceId,
      command: "test",
      pattern: pattern || "short",
    });
    logEvent(game, ctx, gameId, "speaker_test", `Test haut-parleur envoyé à ${deviceId}`);
    callback({ success: true });
  });

  socket.on("host:renameDevice", (rawPayload, callback: Ack) => {
    const parsed = hostRenameDeviceSchema.safeParse(rawPayload);
    if (!parsed.success) return callback({ success: false, error: "Payload invalide" });
    const { gameId, hostToken, deviceId, name } = parsed.data;
    const game = ctx.activeGames[gameId];
    const role = game ? ctx.getHostRole(game, hostToken) : null;
    if (!game || !ctx.hasPermission(role, "control")) return callback({ success: false, error: "Permission refusée" });
    game.hardwareDevices = game.hardwareDevices || {};
    if (!game.hardwareDevices[deviceId]) {
      game.hardwareDevices[deviceId] = {
        id: deviceId,
        name: deviceId,
        status: "offline",
        lastSeenAt: Date.now(),
        sensitivity: 5,
        ledStyle: "classic",
        soundStyle: "default",
      };
    }
    game.hardwareDevices[deviceId].name = name.trim().substring(0, 64);
    game.lastActivity = Date.now();
    logEvent(game, ctx, gameId, "device_renamed", `Buzzer ${deviceId} renommé`);
    ctx.persistGame(game);
    ctx.io.to(gameId).emit("game:hardwareUpdate", game.hardwareDevices);
    ctx.io.to(gameId).emit("game:stateUpdate", ctx.sanitizeGameState(game));
    callback({ success: true });
  });

  socket.on("host:unassignDevice", (rawPayload, callback: Ack) => {
    const parsed = hostUnassignDeviceSchema.safeParse(rawPayload);
    if (!parsed.success) return callback({ success: false, error: "Payload invalide" });
    const { gameId, hostToken, playerId } = parsed.data;
    const game = ctx.activeGames[gameId];
    const role = game ? ctx.getHostRole(game, hostToken) : null;
    if (!game || !ctx.hasPermission(role, "control")) return callback({ success: false, error: "Permission refusée" });
    const player = game.players[playerId];
    if (!player) return callback({ success: false, error: "Joueur introuvable" });
    const previousDeviceId = player.buzzerDeviceId;
    player.buzzerDeviceId = undefined;
    player.deviceType = "mobile";
    if (previousDeviceId && game.hardwareDevices?.[previousDeviceId]) {
      game.hardwareDevices[previousDeviceId].playerId = undefined;
    }
    game.lastActivity = Date.now();
    logEvent(game, ctx, gameId, "device_unassigned", `${player.name} dissocié du buzzer`);
    ctx.persistGame(game);
    ctx.io.to(gameId).emit("game:hardwareUpdate", game.hardwareDevices || {});
    ctx.io.to(gameId).emit("game:stateUpdate", ctx.sanitizeGameState(game));
    callback({ success: true });
  });

  socket.on("host:testDeviceLed", (rawPayload, callback: Ack) => {
    const parsed = hostTestDeviceLedSchema.safeParse(rawPayload);
    if (!parsed.success) return callback({ success: false, error: "Payload invalide" });
    const { gameId, hostToken, deviceId, pattern } = parsed.data;
    const game = ctx.activeGames[gameId];
    const role = game ? ctx.getHostRole(game, hostToken) : null;
    if (!game || !ctx.hasPermission(role, "control")) return callback({ success: false, error: "Permission refusée" });
    ctx.io.of("/devices").to(`device:${deviceId}`).emit("device:led", {
      deviceId,
      command: "test",
      pattern: pattern || "blink",
    });
    logEvent(game, ctx, gameId, "led_test", `Test LED envoyé à ${deviceId}`);
    callback({ success: true });
  });

  socket.on("host:appendRoundTracks", (rawPayload, callback: Ack) => {
    const parsed = hostAppendRoundSchema.safeParse(rawPayload);
    if (!parsed.success) return callback({ success: false, error: "Payload invalide" });
    const { gameId, hostToken, name, tracks } = parsed.data;
    const game = ctx.activeGames[gameId];
    const role = game ? ctx.getHostRole(game, hostToken) : null;
    if (!game || !ctx.hasPermission(role, "control")) return callback({ success: false, error: "Permission refusée" });
    if (game.youtubeVideoId) return callback({ success: false, error: "Mode YouTube non compatible" });

    const defaultTrackDuration = game.defaultTrackDuration || 20;
    const sanitizedTracks: Track[] = tracks.map((t) => ({
      id: String(t.id || crypto.randomUUID()).substring(0, 50),
      title: String(t.title || "Titre").substring(0, 100),
      artist: String(t.artist || "").substring(0, 100),
      url: t.url ? String(t.url).substring(0, 500) : undefined,
      mediaType: t.mediaType ? (String(t.mediaType).substring(0, 20) as any) : undefined,
      mediaUrl: t.mediaUrl ? String(t.mediaUrl).substring(0, 1000) : undefined,
      textContent: t.textContent ? String(t.textContent).substring(0, 2000) : undefined,
      duration: typeof t.duration === "number" ? Math.max(1, Math.min(300, t.duration)) : defaultTrackDuration,
      startTime: typeof t.startTime === "number" ? Math.max(0, t.startTime) : undefined,
      visualHint: t.visualHint ? String(t.visualHint).substring(0, 500) : undefined,
      imageRevealMode: (t.imageRevealMode === "blur" ? "blur" : "none") as "none" | "blur",
      imageRevealDuration:
        typeof t.imageRevealDuration === "number"
          ? Math.max(1, Math.min(300, Math.floor(t.imageRevealDuration)))
          : undefined,
    }));

    const startIndex = game.playlist.length;
    game.playlist.push(...sanitizedTracks);
    game.rounds = game.rounds || [{ id: crypto.randomUUID(), name: "Manche 1", startIndex: 0, endIndex: Math.max(0, startIndex - 1) }];
    game.rounds.push({
      id: crypto.randomUUID(),
      name: name.trim(),
      startIndex,
      endIndex: game.playlist.length - 1,
      textAnswersEnabled: false,
    });
    game.tournamentMode = true;
    game.lastActivity = Date.now();
    logEvent(game, ctx, gameId, "round_added", `Nouvelle manche ajoutée: ${name}`);
    ctx.persistGame(game);
    ctx.io.to(gameId).emit("game:stateUpdate", ctx.sanitizeGameState(game));
    callback({ success: true });
  });

  socket.on("host:setRoundTextMode", (rawPayload, callback: Ack) => {
    const parsed = hostSetRoundTextModeSchema.safeParse(rawPayload);
    if (!parsed.success) return callback({ success: false, error: "Payload invalide" });
    const { gameId, hostToken, roundId, enabled } = parsed.data;
    const game = ctx.activeGames[gameId];
    const role = game ? ctx.getHostRole(game, hostToken) : null;
    if (!game || !ctx.hasPermission(role, "control")) {
      return callback({ success: false, error: "Permission refusée" });
    }
    game.rounds = game.rounds || [];
    const round = game.rounds.find((entry) => entry.id === roundId);
    if (!round) return callback({ success: false, error: "Manche introuvable" });
    round.textAnswersEnabled = enabled;
    game.lastActivity = Date.now();
    logEvent(game, ctx, gameId, "round_text_mode", `Question ouverte ${enabled ? "activée" : "désactivée"} sur ${round.name}`);
    ctx.persistGame(game);
    ctx.io.to(gameId).emit("game:stateUpdate", ctx.sanitizeGameState(game));
    callback({ success: true });
  });

  socket.on("host:validateTextAnswer", (rawPayload, callback: Ack) => {
    const parsed = hostValidateTextAnswerSchema.safeParse(rawPayload);
    if (!parsed.success) return callback({ success: false, error: "Payload invalide" });
    const { gameId, hostToken, answerId, playerId, isCorrect, points } = parsed.data;
    const game = ctx.activeGames[gameId];
    const role = game ? ctx.getHostRole(game, hostToken) : null;
    if (!game || !ctx.hasPermission(role, "control")) return callback({ success: false, error: "Permission refusée" });
    const player = game.players[playerId];
    if (!player) return callback({ success: false, error: "Joueur introuvable" });
    const queue = Array.isArray(game.textAnswers) ? game.textAnswers : [];
    game.textAnswers = queue.filter((entry) => entry.id !== answerId);
    if (isCorrect !== false) {
      const safePoints = typeof points === "number" ? points : 1;
      player.score += safePoints;
      player.stats = player.stats || { buzzes: 0, correctAnswers: 0, wrongAnswers: 0 };
      player.stats.correctAnswers += 1;
      logEvent(game, ctx, gameId, "text_answer_ok", `${player.name} +${safePoints} (réponse ouverte validée)`);
      ctx.io.to(gameId).emit("game:playSound", "correct");
    } else {
      player.stats = player.stats || { buzzes: 0, correctAnswers: 0, wrongAnswers: 0 };
      player.stats.wrongAnswers += 1;
      logEvent(game, ctx, gameId, "text_answer_ko", `${player.name} réponse ouverte refusée`);
    }
    game.lastActivity = Date.now();
    ctx.persistGame(game);
    ctx.io.to(gameId).emit("game:stateUpdate", ctx.sanitizeGameState(game));
    callback({ success: true });
  });

  socket.on("host:startDuel", (rawPayload, callback: Ack) => {
    const parsed = hostStartDuelSchema.safeParse(rawPayload);
    if (!parsed.success) return callback({ success: false, error: "Payload invalide" });
    const { gameId, hostToken, playerAId, playerBId, rewardPoints } = parsed.data;
    const game = ctx.activeGames[gameId];
    const role = game ? ctx.getHostRole(game, hostToken) : null;
    if (!game || !ctx.hasPermission(role, "control")) return callback({ success: false, error: "Permission refusée" });
    if (!game.players[playerAId] || !game.players[playerBId] || playerAId === playerBId) {
      return callback({ success: false, error: "Duel invalide" });
    }
    game.duelState = {
      active: true,
      playerAId,
      playerBId,
      startedAt: Date.now(),
      rewardPoints: rewardPoints || 2,
    };
    game.lastActivity = Date.now();
    logEvent(game, ctx, gameId, "duel_start", `Duel lancé: ${game.players[playerAId].name} vs ${game.players[playerBId].name}`);
    ctx.persistGame(game);
    ctx.io.to(gameId).emit("game:stateUpdate", ctx.sanitizeGameState(game));
    callback({ success: true });
  });

  socket.on("host:resolveDuel", (rawPayload, callback: Ack) => {
    const parsed = hostResolveDuelSchema.safeParse(rawPayload);
    if (!parsed.success) return callback({ success: false, error: "Payload invalide" });
    const { gameId, hostToken, winnerId } = parsed.data;
    const game = ctx.activeGames[gameId];
    const role = game ? ctx.getHostRole(game, hostToken) : null;
    if (!game || !ctx.hasPermission(role, "control")) return callback({ success: false, error: "Permission refusée" });
    if (!game.duelState?.active) return callback({ success: false, error: "Aucun duel actif" });
    if (!game.players[winnerId]) return callback({ success: false, error: "Gagnant invalide" });
    const duelPoints = game.duelState.rewardPoints || 2;
    game.players[winnerId].score += duelPoints;
    game.duelState = {
      ...game.duelState,
      active: false,
      winnerId,
    };
    game.lastActivity = Date.now();
    logEvent(game, ctx, gameId, "duel_end", `${game.players[winnerId].name} gagne le duel (+${duelPoints})`);
    ctx.persistGame(game);
    ctx.io.to(gameId).emit("game:stateUpdate", ctx.sanitizeGameState(game));
    callback({ success: true });
  });

  socket.on("host:applyEventPower", (rawPayload, callback: Ack) => {
    const parsed = hostApplyEventPowerSchema.safeParse(rawPayload);
    if (!parsed.success) return callback({ success: false, error: "Payload invalide" });
    const { gameId, hostToken, power, targetPlayerId } = parsed.data;
    const game = ctx.activeGames[gameId];
    const role = game ? ctx.getHostRole(game, hostToken) : null;
    if (!game || !ctx.hasPermission(role, "control")) return callback({ success: false, error: "Permission refusée" });
    const target = game.players[targetPlayerId];
    if (!target) return callback({ success: false, error: "Joueur cible introuvable" });

    if (power === "x2") {
      target.eventPowerDoubleNext = true;
      logEvent(game, ctx, gameId, "power_x2", `Power-up x2 donné à ${target.name}`);
    } else if (power === "freeze") {
      const freezeMs = 8000;
      target.lockedOut = true;
      target.frozenUntil = Date.now() + freezeMs;
      logEvent(game, ctx, gameId, "power_freeze", `${target.name} est gelé ${Math.round(freezeMs / 1000)}s`);
      setTimeout(() => {
        const currentGame = ctx.activeGames[gameId];
        const currentPlayer = currentGame?.players[targetPlayerId];
        if (!currentGame || !currentPlayer) return;
        if ((currentPlayer.frozenUntil || 0) <= Date.now()) {
          currentPlayer.lockedOut = false;
          currentPlayer.frozenUntil = undefined;
          ctx.persistGame(currentGame);
          ctx.io.to(gameId).emit("game:stateUpdate", ctx.sanitizeGameState(currentGame));
        }
      }, freezeMs + 50);
    } else if (power === "comeback") {
      const topScore = Math.max(...Object.values(game.players).map((p) => p.score));
      const gap = Math.max(0, topScore - target.score);
      const bonus = Math.min(5, Math.max(1, Math.ceil(gap / 2)));
      target.score += bonus;
      logEvent(game, ctx, gameId, "power_comeback", `${target.name} reçoit +${bonus} comeback`);
    }

    game.lastActivity = Date.now();
    ctx.persistGame(game);
    ctx.io.to(gameId).emit("game:stateUpdate", ctx.sanitizeGameState(game));
    callback({ success: true });
  });

  socket.on("host:updateDeviceProfile", (rawPayload, callback: Ack) => {
    const parsed = hostUpdateDeviceProfileSchema.safeParse(rawPayload);
    if (!parsed.success) return callback({ success: false, error: "Payload invalide" });
    const { gameId, hostToken, deviceId, sensitivity, ledStyle, soundStyle } = parsed.data;
    const game = ctx.activeGames[gameId];
    const role = game ? ctx.getHostRole(game, hostToken) : null;
    if (!game || !ctx.hasPermission(role, "control")) return callback({ success: false, error: "Permission refusée" });
    game.hardwareDevices = game.hardwareDevices || {};
    const existing = game.hardwareDevices[deviceId];
    if (!existing) {
      game.hardwareDevices[deviceId] = {
        id: deviceId,
        name: deviceId,
        status: "offline",
        lastSeenAt: Date.now(),
        sensitivity: sensitivity ?? 5,
        ledStyle: ledStyle ?? "classic",
        soundStyle: soundStyle ?? "default",
      };
    } else {
      if (typeof sensitivity === "number") existing.sensitivity = sensitivity;
      if (ledStyle) existing.ledStyle = ledStyle;
      if (soundStyle) existing.soundStyle = soundStyle;
    }
    game.lastActivity = Date.now();
    logEvent(game, ctx, gameId, "device_profile", `Profil matériel mis à jour: ${deviceId}`);
    ctx.persistGame(game);
    ctx.io.to(gameId).emit("game:hardwareUpdate", game.hardwareDevices);
    ctx.io.to(gameId).emit("game:stateUpdate", ctx.sanitizeGameState(game));
    ctx.io.of("/devices").to(`device:${deviceId}`).emit("device:profile", {
      deviceId,
      sensitivity: game.hardwareDevices[deviceId].sensitivity ?? 5,
      ledStyle: game.hardwareDevices[deviceId].ledStyle ?? "classic",
      soundStyle: game.hardwareDevices[deviceId].soundStyle ?? "default",
    });
    callback({ success: true });
  });

  socket.on("player:useJoker", ({ gameId, playerId, jokerType, targetPlayerId }, callback: Ack) => {
    const game = ctx.activeGames[gameId];
    const player = game?.players[playerId];
    if (!game || !player) {
      return callback({ success: false, error: "Partie ou joueur introuvable" });
    }
    // Vérification : seul le socket du joueur concerné peut utiliser ses jokers
    if (player.socketId !== socket.id) {
      return callback({ success: false, error: "Action non autorisée" });
    }
    if (!game.enableBonuses) {
      return callback({ success: false, error: "Les bonus sont désactivés pour cette partie" });
    }
    player.jokers = player.jokers || { doublePoints: true, stealPoints: true, skipRound: true };

    if (jokerType === "double") {
      if (!player.jokers.doublePoints) return callback({ success: false, error: "Joker déjà utilisé" });
      player.jokers.doublePoints = false;
      player.doublePointsArmed = true;
      logEvent(game, ctx, gameId, "joker_double", `${player.name} active x2`);
      ctx.persistGame(game);
      ctx.io.to(gameId).emit("game:stateUpdate", ctx.sanitizeGameState(game));
      return callback({ success: true });
    }

    if (jokerType === "steal") {
      if (!player.jokers.stealPoints) return callback({ success: false, error: "Joker déjà utilisé" });
      const target = targetPlayerId ? game.players[targetPlayerId] : null;
      if (!target) return callback({ success: false, error: "Cible invalide" });
      const stolen = Math.min(2, Math.max(0, target.score));
      target.score -= stolen;
      player.score += stolen;
      player.jokers.stealPoints = false;
      logEvent(game, ctx, gameId, "joker_steal", `${player.name} vole ${stolen} pts à ${target.name}`);
      ctx.persistGame(game);
      ctx.io.to(gameId).emit("game:stateUpdate", ctx.sanitizeGameState(game));
      return callback({ success: true });
    }

    if (jokerType === "skip") {
      if (!player.jokers.skipRound) return callback({ success: false, error: "Joker déjà utilisé" });
      player.jokers.skipRound = false;
      game.status = "revealed";
      logEvent(game, ctx, gameId, "joker_skip", `${player.name} passe la manche`);
      ctx.persistGame(game);
      ctx.io.to(gameId).emit("game:stateUpdate", ctx.sanitizeGameState(game));
      return callback({ success: true });
    }

    callback({ success: false, error: "Joker inconnu" });
  });

  // ── WebRTC mic signaling relay ──────────────────────────────────────────
  // Host requests to activate a player's mic
  socket.on("host:requestPlayerMic", (rawPayload, callback: Ack) => {
    const parsed = z
      .object({
        gameId: z.string().min(1).max(10),
        hostToken: z.string().min(10).max(200),
        playerId: z.string().uuid(),
      })
      .safeParse(rawPayload);
    if (!parsed.success) return callback({ success: false, error: "Payload invalide" });
    const { gameId, hostToken, playerId } = parsed.data;
    const game = ctx.activeGames[gameId];
    if (!game) return callback({ success: false, error: "Partie introuvable" });
    if (!ctx.getHostRole(game, hostToken)) return callback({ success: false, error: "Non autorisé" });
    const player = game.players[playerId];
    if (!player?.socketId) return callback({ success: false, error: "Joueur introuvable" });
    ctx.io.to(player.socketId).emit("host:requestPlayerMic", { hostSocketId: socket.id });
    callback({ success: true });
  });

  // Host sends WebRTC answer to player
  socket.on("host:micAnswer", (rawPayload, callback: Ack) => {
    const parsed = z
      .object({
        gameId: z.string().min(1).max(10),
        hostToken: z.string().min(10).max(200),
        playerId: z.string().uuid(),
        sdp: z.object({ type: z.string(), sdp: z.string() }),
      })
      .safeParse(rawPayload);
    if (!parsed.success) return callback({ success: false, error: "Payload invalide" });
    const { gameId, hostToken, playerId, sdp } = parsed.data;
    const game = ctx.activeGames[gameId];
    if (!game || !ctx.getHostRole(game, hostToken)) return callback({ success: false, error: "Non autorisé" });
    const player = game.players[playerId];
    if (!player?.socketId) return callback({ success: false, error: "Joueur introuvable" });
    ctx.io.to(player.socketId).emit("player:micAnswer", { sdp });
    callback({ success: true });
  });

  // Host sends ICE candidate to player
  socket.on("host:micIceCandidate", (rawPayload, callback: Ack) => {
    const parsed = z
      .object({
        gameId: z.string().min(1).max(10),
        hostToken: z.string().min(10).max(200),
        playerId: z.string().uuid(),
        candidate: z.any(),
      })
      .safeParse(rawPayload);
    if (!parsed.success) return callback({ success: false, error: "Payload invalide" });
    const { gameId, hostToken, playerId, candidate } = parsed.data;
    const game = ctx.activeGames[gameId];
    if (!game || !ctx.getHostRole(game, hostToken)) return callback({ success: false, error: "Non autorisé" });
    const player = game.players[playerId];
    if (!player?.socketId) return callback({ success: false, error: "Joueur introuvable" });
    ctx.io.to(player.socketId).emit("player:micIceCandidate", { candidate });
    callback({ success: true });
  });

  // Host stops the player mic
  socket.on("host:stopPlayerMic", (rawPayload, callback: Ack) => {
    const parsed = z
      .object({
        gameId: z.string().min(1).max(10),
        hostToken: z.string().min(10).max(200),
        playerId: z.string().uuid(),
      })
      .safeParse(rawPayload);
    if (!parsed.success) return callback({ success: false, error: "Payload invalide" });
    const { gameId, hostToken, playerId } = parsed.data;
    const game = ctx.activeGames[gameId];
    if (!game || !ctx.getHostRole(game, hostToken)) return callback({ success: false, error: "Non autorisé" });
    const player = game.players[playerId];
    if (player?.socketId) ctx.io.to(player.socketId).emit("player:micStop");
    callback({ success: true });
  });

  socket.on("disconnect", () => {
    const currentGameId = socket.data.hostGameId as string | undefined;
    if (!currentGameId) return;
    void emitHostsPresence(ctx, currentGameId);
  });
}
