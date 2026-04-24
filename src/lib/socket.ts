import { io } from "socket.io-client";

const host = typeof window !== "undefined" ? window.location.hostname : "";
const isProdSharedHost = host === "blindtestlive.fullann.ch";

// Connect to the same host that serves the app
export const socket = io("/", {
  autoConnect: true,
  // On fullann shared host, websocket frames are sometimes altered by proxy/WAF.
  // Keep polling-only there to avoid broken WS upgrade loops.
  transports: isProdSharedHost ? ["polling"] : ["polling", "websocket"],
  upgrade: !isProdSharedHost,
  reconnection: true,
  reconnectionAttempts: Infinity,
  // Soften reconnect storms that can trigger anti-bot protections.
  reconnectionDelay: 2500,
  reconnectionDelayMax: 30000,
  randomizationFactor: 0.5,
  timeout: 20000,
});

type SocketConnectionState = {
  connected: boolean;
  reconnecting: boolean;
  transport: string | null;
  lastError: string | null;
  updatedAt: number;
};

function emitSocketState(partial: Partial<SocketConnectionState>) {
  if (typeof window === "undefined") return;
  const next: SocketConnectionState = {
    connected: socket.connected,
    reconnecting: !socket.connected,
    transport: socket.io.engine?.transport?.name || null,
    lastError: null,
    updatedAt: Date.now(),
    ...partial,
  };
  window.dispatchEvent(new CustomEvent("blindtest:socket-state", { detail: next }));
}

let lastLoggedErrorAt = 0;
socket.on("connect", () => {
  emitSocketState({
    connected: true,
    reconnecting: false,
    transport: socket.io.engine?.transport?.name || null,
    lastError: null,
  });
});
socket.on("disconnect", (reason) => {
  emitSocketState({
    connected: false,
    reconnecting: true,
    lastError: `disconnect:${reason}`,
  });
});
socket.on("connect_error", (error: any) => {
  const now = Date.now();
  if (now - lastLoggedErrorAt > 5000) {
    lastLoggedErrorAt = now;
    console.warn("socket connect_error:", error?.message || error);
  }
  emitSocketState({
    connected: false,
    reconnecting: true,
    lastError: error?.message || "connect_error",
  });
});
socket.io.on("reconnect_attempt", () => {
  emitSocketState({
    connected: false,
    reconnecting: true,
    lastError: null,
  });
});
socket.io.on("reconnect_error", (error: any) => {
  emitSocketState({
    connected: false,
    reconnecting: true,
    lastError: error?.message || "reconnect_error",
  });
});
socket.io.on("reconnect_failed", () => {
  emitSocketState({
    connected: false,
    reconnecting: false,
    lastError: "reconnect_failed",
  });
});

// Retry silently when the tab becomes active again (no manual refresh needed).
if (typeof window !== "undefined") {
  emitSocketState({
    connected: socket.connected,
    reconnecting: !socket.connected,
    transport: socket.io.engine?.transport?.name || null,
    lastError: null,
  });
  window.addEventListener("online", () => {
    if (!socket.connected) socket.connect();
  });
  window.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && !socket.connected) socket.connect();
  });
  window.addEventListener("pageshow", () => {
    if (!socket.connected) socket.connect();
  });
}
