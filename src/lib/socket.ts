import { io } from "socket.io-client";

const host = typeof window !== "undefined" ? window.location.hostname : "";
const isProdSharedHost = host === "blindtestlive.fullann.ch";

/**
 * Déploiement multi-instances : Socket.IO en polling exige une affinité de session (sticky)
 * sur `/socket.io/` sinon le POST avec `sid` part sur un autre pod → 400 + reconnexions en boucle.
 * 503 = proxy / LB sans backend sain ou timeout.
 *
 * `VITE_SOCKET_USE_WEBSOCKET=true` : tente WebSocket en premier (moins de requêtes HTTP ; à valider si le WAF ne casse pas l’upgrade).
 * `VITE_SOCKET_POLLING_ONLY=true` : force le polling partout (utile si WS impossible).
 */
const viteEnv = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
const forcePolling =
  viteEnv?.VITE_SOCKET_POLLING_ONLY === "true" ||
  (isProdSharedHost && viteEnv?.VITE_SOCKET_USE_WEBSOCKET !== "true");
/** Hors « polling only », même ordre qu’avant : polling puis upgrade WebSocket si activé. */
const transports = forcePolling
  ? (["polling"] as const)
  : (["polling", "websocket"] as const);

// Connect to the same host that serves the app
export const socket = io("/", {
  autoConnect: true,
  path: "/socket.io/",
  withCredentials: true,
  transports: [...transports],
  upgrade: !forcePolling,
  reconnection: true,
  reconnectionAttempts: Infinity,
  // Reconnexion rapide après une coupure courte (réseau mobile, veille écran).
  // Le backoff évite de saturer le serveur en cas de panne prolongée.
  reconnectionDelay: 1000,
  reconnectionDelayMax: 10000,
  randomizationFactor: 0.3,
  timeout: 15000,
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

// ── Watchdog : détecte une connexion "gelée" ──────────────────────────────────
// o2switch (et certains WAF) peut couper silencieusement les requêtes polling
// sans envoyer de FIN TCP → socket.connected reste true mais plus rien ne passe.
// On surveille l'horodatage du dernier trafic reçu ; si le socket est connecté
// mais muet depuis plus longtemps que pingInterval + pingTimeout + marge, on force
// un cycle disconnect/connect pour briser l'état gelé.
let lastActivityAt = Date.now();

// Tout événement entrant (y compris les pings moteur internes) remet le compteur à zéro.
socket.onAny(() => {
  lastActivityAt = Date.now();
});

// pingInterval(10 s) + pingTimeout(15 s) + marge(15 s) = 40 s
const WATCHDOG_IDLE_MS = 40_000;

function forceReconnect(reason: string) {
  console.warn(`[socket] ${reason} — reconnexion forcée`);
  emitSocketState({ connected: false, reconnecting: true, lastError: reason });
  socket.disconnect();
  socket.connect();
}

let lastLoggedErrorAt = 0;
socket.on("connect", () => {
  lastActivityAt = Date.now();
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

if (typeof window !== "undefined") {
  emitSocketState({
    connected: socket.connected,
    reconnecting: !socket.connected,
    transport: socket.io.engine?.transport?.name || null,
    lastError: null,
  });

  // Watchdog : vérifie toutes les 15 s si le socket est gelé.
  setInterval(() => {
    if (!socket.connected) return;
    const idle = Date.now() - lastActivityAt;
    if (idle > WATCHDOG_IDLE_MS) {
      forceReconnect(`connexion gelée (${Math.round(idle / 1000)} s sans trafic)`);
    }
  }, 15_000);

  window.addEventListener("online", () => {
    if (!socket.connected) socket.connect();
  });

  window.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    if (!socket.connected) {
      socket.connect();
      return;
    }
    // L'onglet vient de reprendre : si le socket semble connecté mais n'a pas eu
    // de trafic depuis trop longtemps (mise en veille / WAF), forcer un cycle.
    const idle = Date.now() - lastActivityAt;
    if (idle > WATCHDOG_IDLE_MS) {
      forceReconnect(`onglet réactivé après ${Math.round(idle / 1000)} s d'inactivité`);
    }
  });

  window.addEventListener("pageshow", () => {
    if (!socket.connected) socket.connect();
  });
}
