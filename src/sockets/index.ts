import type { Profile } from "@prisma/client";
import type { Server, Socket } from "socket.io";
import { isGuest, verifyAccessToken } from "../lib/auth.js";
import { ensureProfile } from "../services/profile.js";
import { startInactivitySweep } from "../services/inactivity.js";
import { startDisconnectGrace } from "../services/playerLifecycle.js";
import { activePlayers } from "../state/presence.js";
import { registerChat } from "./handlers/chat.js";
import { registerPlayerState } from "./handlers/player.js";
import { registerRoomJoin } from "./handlers/roomJoin.js";
import { startGameLoop } from "./tick.js";

export function setupSocketIO(io: Server): void {
  // Auth: validasi JWT Supabase lalu pastikan profil ada
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) return next(new Error("Unauthorized: Missing token"));

      const user = await verifyAccessToken(token);
      if (!user) return next(new Error("Unauthorized: Invalid token"));

      socket.data.profile = await ensureProfile(user);
      socket.data.isGuest = isGuest(user);
      next();
    } catch (err) {
      console.error("[Socket Auth] Error:", err);
      next(new Error("Authentication error"));
    }
  });

  io.on("connection", (socket: Socket) => {
    const profile = socket.data.profile as Profile;
    console.log(`[Socket Connected] ${profile.fullName} (${socket.id})`);

    registerRoomJoin(io, socket);
    registerPlayerState(io, socket);
    registerChat(io, socket);

    socket.on("disconnect", (reason) => handleDisconnect(io, socket, reason));
  });

  startGameLoop(io);
  startInactivitySweep(io);
}

/**
 * Socket putus: avatar tidak langsung dihapus, melainkan masuk grace period.
 * Jika pemain join ulang dalam batas waktu, sesinya digantikan dan posisinya dibawa.
 */
function handleDisconnect(io: Server, socket: Socket, reason: string): void {
  if (activePlayers.has(socket.id)) {
    startDisconnectGrace(io, socket.id);
  }

  console.log(
    `[Socket Disconnected] ${socket.data.profile?.fullName} (${reason})`,
  );
}
