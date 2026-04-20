import { io } from "socket.io-client";

// Connect to the same host that serves the app
export const socket = io("/", {
  autoConnect: true,
  transports: ["polling"],
  upgrade: false,
});
