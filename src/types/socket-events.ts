/**
 * Types côté client alignés sur les handlers Socket.IO serveur.
 * Quand tu modifies un schéma Zod côté serveur, mets à jour le type correspondant ici.
 *
 * Références serveur :
 * - `server/socket/game-state.ts` — game:check, game:ping, player:watchLobby, game:lobbyMeta, game:requestState
 * - `server/socket/player.ts` — player:joinGame, player:micOffer (+ targetHostSocketId), …
 * - `server/socket/host.ts` — host:* , WebRTC answer/ICE
 */

import type { GameState } from '../types';

/** @see server/socket/game-state.ts `game:check` callback */
export type GameCheckResult =
  | {
      success: true;
      status: GameState['status'];
      isTeamMode?: boolean;
      enableBonuses?: boolean;
      teamConfig?: Array<{ id: string; name: string; color: string; enabled: boolean }>;
    }
  | { success: false; error?: string };

/** @see server/socket/game-state.ts `game:ping` ack */
export type GamePingAck = { success: true } | { success: false; error?: string };

/** @see server/socket/game-state.ts `player:watchLobby` callback */
export type PlayerWatchLobbyResult =
  | {
      success: true;
      status: GameState['status'];
      isTeamMode?: boolean;
      enableBonuses?: boolean;
      teamConfig?: Array<{ id: string; name: string; color: string; enabled: boolean }>;
    }
  | { success: false; error?: string };

/** @see server/socket/game-state.ts emit `game:lobbyMeta` */
export type GameLobbyMetaPayload = {
  gameId: string;
  status: GameState['status'];
  isTeamMode: boolean;
  enableBonuses?: boolean;
  teamConfig: Array<{ id: string; name: string; color: string; enabled: boolean }>;
};

/** @see server/socket/game-state.ts `game:requestState` callback (joueur / host / écran) */
export type GameRequestStateResult =
  | { success: true; state: GameState; role?: 'owner' | 'cohost' }
  | { success: false; error?: string };

/** Signalisation micro : animateur qui a demandé le flux */
export type HostRequestPlayerMicPayload = {
  hostSocketId: string;
};

/** @see server/socket/player.ts `player:micOffer` body */
export type PlayerMicOfferPayload = {
  gameId: string;
  playerId: string;
  sdp: RTCSessionDescriptionInit;
  targetHostSocketId?: string;
};

export type SocketAck<T = { success: boolean; error?: string }> = T;

/** @see server/socket/player.ts `player:joinGame` ack */
export type PlayerJoinGameAck = { success: true } | { success: false; error?: string };
