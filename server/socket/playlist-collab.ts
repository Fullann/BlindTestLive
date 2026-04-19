import { Server, Socket } from "socket.io";
import pool from "../db.js";

interface PlaylistCollabContext {
  io: Server;
  socket: Socket;
}

async function emitPlaylistPresence(io: Server, playlistId: string) {
  const sockets = await io.in(`playlist:${playlistId}`).fetchSockets();
  const editors = sockets
    .filter((s) => s.data?.playlistId === playlistId)
    .map((s) => ({
      socketId: s.id,
      connectedAt: s.data.playlistConnectedAt || Date.now(),
    }));
  io.to(`playlist:${playlistId}`).emit("playlist:presence", {
    playlistId,
    editors,
    count: editors.length,
  });
}

async function canAccess(playlistId: string, userId: string | null, collabToken?: string | null): Promise<boolean> {
  const [rows] = await pool.query("SELECT id, owner_id FROM playlists WHERE id = ?", [playlistId]);
  const playlist = (rows as any[])[0];
  if (!playlist) return false;
  if (userId && playlist.owner_id === userId) return true;
  if (!collabToken) return false;
  const [tokens] = await pool.query(
    `SELECT 1 FROM playlist_collab_tokens
     WHERE playlist_id = ? AND token = ? AND expires_at > ?
     LIMIT 1`,
    [playlistId, collabToken, Date.now()],
  );
  return (tokens as any[]).length > 0;
}

async function getPlaylist(playlistId: string) {
  const [rows] = await pool.query("SELECT * FROM playlists WHERE id = ?", [playlistId]);
  return (rows as any[])[0] || null;
}

function getUserIdFromSocket(socket: Socket): string | null {
  // Aucune auth socket centralisée actuellement. On garde null et on s'appuie sur le collabToken.
  return null;
}

export function registerPlaylistCollabHandlers(ctx: PlaylistCollabContext) {
  const { io, socket } = ctx;

  socket.on("playlist:join", async (payload, callback) => {
    try {
      const playlistId = String(payload?.playlistId || "");
      const collabToken = payload?.collabToken ? String(payload.collabToken) : null;
      if (!playlistId) return callback?.({ success: false, error: "playlistId manquant" });
      const userId = getUserIdFromSocket(socket);
      const allowed = await canAccess(playlistId, userId, collabToken);
      if (!allowed) return callback?.({ success: false, error: "Accès refusé" });
      socket.join(`playlist:${playlistId}`);
      socket.data.playlistId = playlistId;
      socket.data.playlistConnectedAt = Date.now();
      const playlist = await getPlaylist(playlistId);
      void emitPlaylistPresence(io, playlistId);
      return callback?.({ success: true, playlist });
    } catch {
      return callback?.({ success: false, error: "Erreur serveur" });
    }
  });

  socket.on("playlist:update", async (payload, callback) => {
    try {
      const playlistId = String(payload?.playlistId || "");
      const collabToken = payload?.collabToken ? String(payload.collabToken) : null;
      const data = payload?.data || {};
      if (!playlistId) return callback?.({ success: false, error: "playlistId manquant" });
      const userId = getUserIdFromSocket(socket);
      const allowed = await canAccess(playlistId, userId, collabToken);
      if (!allowed) return callback?.({ success: false, error: "Accès refusé" });

      const updates: string[] = [];
      const values: any[] = [];
      if (data.name !== undefined) {
        updates.push("name = ?");
        values.push(String(data.name).trim().slice(0, 255));
      }
      if (data.category !== undefined) {
        updates.push("category = ?");
        values.push(String(data.category || "general").trim().slice(0, 64) || "general");
      }
      if (data.tracks !== undefined) {
        updates.push("tracks = ?");
        values.push(JSON.stringify(Array.isArray(data.tracks) ? data.tracks : []));
      }
      if (updates.length === 0) return callback?.({ success: false, error: "Aucune donnée à mettre à jour" });
      values.push(playlistId);
      await pool.query(`UPDATE playlists SET ${updates.join(", ")} WHERE id = ?`, values);
      const playlist = await getPlaylist(playlistId);
      io.to(`playlist:${playlistId}`).emit("playlist:state", { playlist });
      return callback?.({ success: true });
    } catch {
      return callback?.({ success: false, error: "Erreur serveur" });
    }
  });

  socket.on("disconnect", () => {
    const playlistId = socket.data.playlistId as string | undefined;
    if (!playlistId) return;
    void emitPlaylistPresence(io, playlistId);
  });
}

