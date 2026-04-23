import { Server, Socket } from "socket.io";
import { GameState, Player } from "../../src/types";

export type HostRole = "owner" | "cohost";
export type HostPermission = "control" | "kick" | "end";
export type ServerGameState = GameState & { hostRoles: Record<string, HostRole> };
export type Ack = (result: { success: boolean; error?: string; [key: string]: unknown }) => void;

export interface SocketHandlerContext {
  io: Server;
  socket: Socket;
  socketIp: string;
  activeGames: Record<string, ServerGameState>;
  persistGame: (game: ServerGameState) => void;
  removeGame: (gameId: string) => void;
  enforceGameLimits: (socketId: string, ip: string) => boolean;
  sanitizeGameState: (game: ServerGameState) => Omit<ServerGameState, "hostToken" | "hostRoles" | "cohostTokenExpiresAt">;
  getHostRole: (game: ServerGameState, hostToken: string) => HostRole | null;
  hasPermission: (role: HostRole | null, permission: HostPermission) => boolean;
  generateGameCode: () => string;
  getRandomColor: () => string;
  shuffleArray: <T>(array: T[]) => T[];
  buzzRateLimitsBySocket: Map<string, number>;
  buzzRateLimitsByIp: Map<string, number>;
  auditLog: (event: string, data: Record<string, unknown>) => void;
  persistFinishedGameAnalytics?: (game: ServerGameState, reason: string) => Promise<void> | void;
}

export type PlayerMap = Record<string, Player>;
