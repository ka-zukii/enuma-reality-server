import type { Server } from "socket.io";
import { activePlayers, PlayerState, roomChannel } from "../state/presence.js";
import { advanceTram, getTram, pruneTrams, snapshotTram } from "../services/tram.js";

const TICK_MS = 50; // 20 Hz

/**
 * Game loop: setiap 50ms
 * - langkahkan trem di tiap room yang punya pemain,
 * - broadcast posisi semua pemain per room (room:tick),
 * - broadcast status trem dan waktu server (room:world).
 */
export function startGameLoop(io: Server): void {
  setInterval(() => {
    const now = Date.now();

    const byRoom = new Map<string, PlayerState[]>();
    for (const player of activePlayers.values()) {
      const list = byRoom.get(player.roomId) ?? [];
      list.push(player);
      byRoom.set(player.roomId, list);
    }

    for (const [roomId, players] of byRoom) {
      const channel = roomChannel(roomId);

      const tram = getTram(roomId);
      advanceTram(tram, now);

      io.to(channel).emit(
        "room:tick",
        players.map((p) => ({
          socketId: p.socketId,
          userId: p.userId,
          position: p.position,
          rotationY: p.rotationY,
          animation: p.animation,
          zone: p.zone,
          ride: p.ride ?? null,
          connectionState: p.connectionState,
        })),
      );

      io.to(channel).emit("room:world", {
        tram: snapshotTram(tram),
        serverTime: now,
      });
    }

    // Trem di room yang sudah kosong dibuang
    pruneTrams(new Set(byRoom.keys()));
  }, TICK_MS);
}
