import type { Server, Socket } from "socket.io";
import {
  activePlayers,
  PLAYER_STATUSES,
  PlayerStatus,
  Position,
  roomChannel,
} from "../../state/presence.js";
import { onEvent } from "../guard.js";

interface MovePayload {
  position: Position;
  rotationY: number;
  animation: "idle" | "walk";
  zone?: string;
}

export function registerPlayerState(io: Server, socket: Socket): void {
  // 2. Update koordinat & zona pergerakan avatar
  socket.on("player:move", (payload: MovePayload) => {
    const player = activePlayers.get(socket.id);
    if (!player || !payload?.position) return;

    player.position = payload.position;
    player.rotationY = payload.rotationY;
    player.animation = payload.animation;
    if (payload.zone) player.zone = payload.zone;
    player.lastActiveAt = Date.now();
  });

  // 2a. Heartbeat: dikirim client saat pemain aktif (mis. ada input dalam 1 menit terakhir).
  // Tanpa heartbeat, pemain yang diam saja akan dianggap tidak aktif.
  socket.on("player:heartbeat", () => {
    const player = activePlayers.get(socket.id);
    if (player) player.lastActiveAt = Date.now();
  });

  // 2b. Ubah status presence (LIVE, PAGI, STANDUP, ISTIRAHAT, TAMU)
  onEvent<{ status?: unknown }>(socket, "player:status", (payload) => {
    const player = activePlayers.get(socket.id);
    if (!player) return;
    if (!(PLAYER_STATUSES as readonly unknown[]).includes(payload?.status))
      return;

    player.status = payload.status as PlayerStatus;
    player.lastActiveAt = Date.now();

    io.to(roomChannel(player.roomId)).emit("player:status", {
      socketId: socket.id,
      userId: player.userId,
      status: player.status,
    });
  });
}
