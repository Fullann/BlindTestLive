export type MediaType = 'audio' | 'video' | 'image' | 'text' | 'youtube' | 'spotify' | 'url';

export interface Track {
  id: string;
  title: string;
  artist: string;
  mediaType?: MediaType;
  mediaUrl?: string; // URL to the media file or YouTube/Spotify ID
  textContent?: string; // If mediaType is 'text'
  duration?: number; // Time allowed for this track in seconds
  startTime?: number; // Start time in seconds for audio/video
  url?: string; // Legacy URL
}

export interface Player {
  id: string; // Persistent UUID
  socketId: string; // Current socket connection
  name: string;
  color: string;
  score: number;
  lockedOut: boolean;
  team?: string; // Optional team name/color
  playerSecret?: string; // Secret token for reconnection
}

export type GameStatus = 'lobby' | 'countdown' | 'playing' | 'paused' | 'revealed' | 'finished';

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
  isSpotifyMode?: boolean;
  isTeamMode?: boolean;
  roundNumber?: number;
  lastActivity: number;
}

export interface Playlist {
  id: string;
  name: string;
  ownerId: string;
  tracks: Track[];
  createdAt: number;
}
