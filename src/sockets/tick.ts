import type { Server } from "socket.io";
import { activePlayers, PlayerState, roomChannel } from "../state/presence.js";
import { advanceTram, getTram, pruneTrams, snapshotTram } from "../services/tram.js";
import { getNpcWorld, isExteriorRoom, pruneNpcWorlds } from "../npc/world.js";

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

      // NPC kota: disimulasikan di server, sama untuk semua pemain di room
      if (isExteriorRoom(roomId)) {
        const world = getNpcWorld(roomId, now);
        world.step(
          now,
          players
            .filter((p) => p.connectionState === "connected")
            .map((p) => ({ x: p.position[0], z: p.position[2] })),
          tram,
        );
        if (world.shouldBroadcast()) {
          io.to(channel).emit("npc:world", world.snapshot(now));
        }
      }
    }

    // Trem dan NPC di room yang sudah kosong dibuang
    const activeRooms = new Set(byRoom.keys());
    pruneTrams(activeRooms);
    pruneNpcWorlds(activeRooms);
  }, TICK_MS);
}
