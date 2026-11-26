// src/sockets/handlers/npc.ts
// Pemain mengklik NPC. Efeknya (bubble dialog) disiarkan lewat npc:world ke semua pemain.
import type { Server, Socket } from "socket.io";
import { getNpcWorld, isExteriorRoom } from "../../npc/world.js";
import { activePlayers } from "../../state/presence.js";
import { onEvent } from "../guard.js";

export function registerNpcInteract(_io: Server, socket: Socket): void {
  onEvent<{ id?: unknown }>(socket, "npc:interact", (payload) => {
    const player = activePlayers.get(socket.id);
    if (!player || !isExteriorRoom(player.roomId)) return;
    if (typeof payload?.id !== "string" || payload.id.length > 64) return;
    getNpcWorld(player.roomId, Date.now()).interact(payload.id, Date.now());
  });
}
