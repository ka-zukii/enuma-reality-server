import type { Server } from "socket.io";
import { DISCONNECT_GRACE_MS } from "../config/settings.js";
import {
  activePlayers,
  countOnlinePlayersInWorkspace,
  roomChannel,
} from "../state/presence.js";
import { scheduleWorkspaceCleanup } from "./workspaceCleanup.js";

// socket.id -> timer grace period
const graceTimers = new Map<string, NodeJS.Timeout>();

/**
 * Socket putus: jangan langsung hapus avatar. Tandai "reconnecting" dan beri tahu room.
 * Jika tidak ada sesi baru yang menggantikan dalam grace period, pemain dihapus.
 */
export function startDisconnectGrace(io: Server, socketId: string): void {
  const player = activePlayers.get(socketId);
  if (!player || graceTimers.has(socketId)) return;

  player.connectionState = "reconnecting";

  io.to(roomChannel(player.roomId)).emit("player:reconnecting", {
    socketId,
    userId: player.userId,
  });

  const timer = setTimeout(() => {
    graceTimers.delete(socketId);

    const current = activePlayers.get(socketId);
    if (!current || current.connectionState !== "reconnecting") return;

    removePlayer(io, socketId);
    console.log(
      `[Grace] ${current.fullName} tidak kembali dalam ${DISCONNECT_GRACE_MS / 1000}s, avatar dihapus.`,
    );
  }, DISCONNECT_GRACE_MS);

  graceTimers.set(socketId, timer);
}

/** Batalkan grace period untuk socket tertentu (misalnya saat sesi diganti) */
export function cancelDisconnectGrace(socketId: string): void {
  const timer = graceTimers.get(socketId);
  if (!timer) return;

  clearTimeout(timer);
  graceTimers.delete(socketId);
}

/**
 * Hapus pemain dari server: hilangkan dari activePlayers, batalkan grace period,
 * beri tahu room, dan jadwalkan cleanup workspace jika sudah kosong.
 */
export function removePlayer(io: Server, socketId: string): void {
  const player = activePlayers.get(socketId);
  if (!player) return;

  activePlayers.delete(socketId);
  cancelDisconnectGrace(socketId);

  io.to(roomChannel(player.roomId)).emit("player:left", {
    socketId,
    userId: player.userId,
  });

  if (countOnlinePlayersInWorkspace(player.workspaceId) === 0) {
    scheduleWorkspaceCleanup(player.workspaceId);
  }
}
