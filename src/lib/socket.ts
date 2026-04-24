import { io } from "socket.io-client";

// Connect to the same host that serves the app
export const socket = io("/", {
  autoConnect: true,
  // Start with polling then upgrade when possible.
  // This avoids total failure on hosts/proxies that break raw WebSocket frames.
  transports: ["polling", "websocket"],
  upgrade: true,
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 10000,
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
