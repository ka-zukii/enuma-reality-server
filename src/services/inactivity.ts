import type { Server } from "socket.io";
import {
  INACTIVITY_SWEEP_MS,
  INACTIVITY_TIMEOUT_MS,
} from "../config/settings.js";
import { activePlayers, roomChannel } from "../state/presence.js";
import { removePlayer } from "./playerLifecycle.js";

/** Jalankan pemeriksaan pemain tidak aktif secara berkala */
export function startInactivitySweep(io: Server): void {
  setInterval(() => sweepInactivePlayers(io), INACTIVITY_SWEEP_MS);

  console.log(
    `⏱️ [Inactivity] Pemain tidak aktif dikeluarkan setelah ${INACTIVITY_TIMEOUT_MS / 1000}s tanpa aktivitas.`,
  );
}

/**
 * Keluarkan pemain yang sudah melewati batas tidak aktif.
 * Pemain yang sedang reconnecting dilewati karena diatur oleh grace period.
 */
export function sweepInactivePlayers(
  io: Server,
  now: number = Date.now(),
): void {
  for (const [socketId, player] of activePlayers) {
    if (player.connectionState !== "connected") continue;
    if (now - player.lastActiveAt < INACTIVITY_TIMEOUT_MS) continue;

    const socket = io.sockets.sockets.get(socketId);
    if (socket) {
      // Keluarkan socket dari room dulu agar tidak menerima event room lagi
      socket.leave(roomChannel(player.roomId));
      socket.emit("player:idle", {
        workspaceId: player.workspaceId,
        roomId: player.roomId,
      });
    }

    removePlayer(io, socketId);

    console.log(
      `[Inactivity] ${player.fullName} dikeluarkan dari room ${player.roomId} (tidak aktif)`,
    );
  }
}
