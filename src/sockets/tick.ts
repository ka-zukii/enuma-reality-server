import type { Server } from "socket.io";
import { activePlayers, PlayerState, roomChannel } from "../state/presence.js";

const TICK_MS = 50; // 20 Hz

/** Game loop: broadcast posisi semua pemain per room setiap 50ms */
export function startGameLoop(io: Server): void {
  setInterval(() => {
    const byRoom = new Map<string, PlayerState[]>();
    for (const player of activePlayers.values()) {
      const list = byRoom.get(player.roomId) ?? [];
      list.push(player);
      byRoom.set(player.roomId, list);
    }

    for (const [roomId, players] of byRoom) {
      io.to(roomChannel(roomId)).emit(
        "room:tick",
        players.map((p) => ({
          socketId: p.socketId,
          userId: p.userId,
          position: p.position,
          rotationY: p.rotationY,
          animation: p.animation,
          zone: p.zone,
          connectionState: p.connectionState,
        })),
      );
    }
  }, TICK_MS);
}
