// audio: fichier audio uploadé ou URL directe
// video: fichier vidéo uploadé ou URL directe
// image: image uploadée ou URL
// text: texte/indice affiché à l'écran
// voice: enregistrement vocal (fichier audio généré par le navigateur)
// youtube: lien YouTube (embed)
// url: URL générique (audio/vidéo externe)
export type MediaType = 'audio' | 'video' | 'image' | 'text' | 'voice' | 'youtube' | 'url';

export interface Track {
  id: string;
  title: string;
  artist: string;
  mediaType?: MediaType;
  mediaUrl?: string; // URL to the media file or YouTube ID
  textContent?: string; // If mediaType is 'text'
  duration?: number; // Time allowed for this track in seconds
  startTime?: number; // Start time in seconds for audio/video
  url?: string; // Legacy URL
  visualHint?: string; // Hint displayed for visual quiz rounds
  imageRevealMode?: 'none' | 'blur';
  imageRevealDuration?: number; // seconds to progressively remove blur
}

export interface Player {
  id: string; // Persistent UUID
  socketId: string; // Current socket connection
  publicId?: string; // Anonymous persistent ID (no account required)
  name: string;
  color: string;
  score: number;
  lockedOut: boolean;
  team?: string; // Optional team name/color
  playerSecret?: string; // Secret token for reconnection
  combo?: number;
  jokers?: {
    doublePoints: boolean;
    stealPoints: boolean;
    skipRound: boolean;
  };
  doublePointsArmed?: boolean;
  stats?: {
    buzzes: number;
    correctAnswers: number;
    wrongAnswers: number;
  };
  deviceType?: 'mobile' | 'esp32';
  buzzerDeviceId?: string;
  eventPowerDoubleNext?: boolean;
  frozenUntil?: number;
}

export interface TeamConfig {
  id: string;
  name: string;
  color: string;
  enabled: boolean;
}

export type GameStatus = 'lobby' | 'onboarding' | 'countdown' | 'playing' | 'paused' | 'revealed' | 'finished';

export interface HardwareDeviceState {
  id: string;
  name: string;
  gameId?: string;
  playerId?: string;
  status: 'offline' | 'online';
  lastSeenAt: number;
  firmware?: string;
  rssi?: number;
  speakerEnabled?: boolean;
  speakerMuted?: boolean;
  sensitivity?: number;
  ledStyle?: 'classic' | 'pulse' | 'rainbow';
  soundStyle?: 'default' | 'arcade' | 'soft';
}

export interface TextAnswerSubmission {
  id: string;
  playerId: string;
  playerName: string;
  answer: string;
  createdAt: number;
}

export interface DuelState {
  active: boolean;
  playerAId: string;
  playerBId: string;
  startedAt: number;
  winnerId?: string;
  rewardPoints?: number;
}

export interface GameState {
  id: string;
  adminId: string;
  hostToken: string;
  status: GameStatus;
  players: Record<string, Player>;
  playlist: Track[];
  currentTrackIndex: number;
  buzzedPlayerId: string | null;
  buzzTimestamp: number | null;
  trackStartTime?: number; // When the current track started playing
  countdown?: number; // 3, 2, 1, 0
  youtubeVideoId?: string;
  isTeamMode?: boolean;
  shuffleQuestions?: boolean;
  roundNumber?: number;
  difficulty?: "easy" | "medium" | "hard";
  defaultTrackDuration?: number;
  theme?: "dark" | "neon" | "retro" | "minimal";
  eventLogs?: Array<{ ts: number; type: string; message: string }>;
  hostTokenExpiresAt?: number;
  cohostTokenExpiresAt?: Record<string, number>;
  lastActivity: number;
  enableBonuses?: boolean;
  teamConfig?: TeamConfig[];
  onboardingEnabled?: boolean;
  tutorialSeconds?: number;
  tournamentMode?: boolean;
  strictTimerEnabled?: boolean;
  rules?: {
    wrongAnswerPenalty: number;
    progressiveLock: boolean;
    progressiveLockBaseMs: number;
    antiSpamPenalty: number;
  };
  rounds?: Array<{
    id: string;
    name: string;
    startIndex: number;
    endIndex: number;
    textAnswersEnabled?: boolean;
  }>;
  hardwareDevices?: Record<string, HardwareDeviceState>;
  trackStats?: Record<string, {
    trackIndex: number;
    trackId?: string;
    title: string;
    artist: string;
    playedCount: number;
    totalBuzzes: number;
    correctAnswers: number;
    wrongAnswers: number;
    revealedWithoutAnswer: number;
    fastestBuzzMs?: number;
    fastestBuzzPlayerId?: string;
  }>;
  textAnswers?: TextAnswerSubmission[];
  duelState?: DuelState | null;
}

export interface Playlist {
  id: string;
  name: string;
  ownerId: string;
  tracks: Track[];
  createdAt: number;
  visibility?: "private" | "public";
  category?: string;
  likesCount?: number;
  downloadsCount?: number;
  ownerEmail?: string;
}

export type BlindTestMode = "playlist" | "youtube";
export type BlindTestStatus = "active" | "finished";

export interface BlindTestSession {
  id: string;
  ownerId: string;
  title: string;
  mode: BlindTestMode;
  status: BlindTestStatus;
  createdAt: number;
  endedAt?: number;
  gameId: string;
  hostToken?: string;
  playlistId?: string;
  sourceUrl?: string;
}
