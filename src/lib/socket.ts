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

// Retry silently when the tab becomes active again (no manual refresh needed).
if (typeof window !== "undefined") {
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
