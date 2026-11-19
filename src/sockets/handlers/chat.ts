import { randomUUID } from "node:crypto";
import type { Server, Socket } from "socket.io";
import { prisma } from "../../config/clients.js";
import { ZONE } from "../../config/layouts.js";
import { PROXIMITY_CHAT_RADIUS } from "../../config/settings.js";
import {
  activePlayers,
  getDistanceXZ,
  PlayerState,
  roomChannel,
  userChannel,
  workspaceChannel,
} from "../../state/presence.js";
import { onEvent } from "../guard.js";

type ChatChannel = "PROXIMITY" | "GLOBAL" | "PRIVATE";

interface ChatPayload {
  channel: ChatChannel;
  content: string;
  receiverId?: string;
}

export function registerChat(io: Server, socket: Socket): void {
  onEvent<Partial<ChatPayload>>(socket, "chat:send", async (payload) => {
    const sender = activePlayers.get(socket.id);
    const content = payload?.content?.trim();
    if (!sender || !content) return;

    switch (payload?.channel) {
      case "PROXIMITY":
        return sendProximity(io, sender, content);
      case "GLOBAL":
        return sendGlobal(io, sender, content);
      case "PRIVATE":
        if (payload.receiverId) {
          return sendPrivate(io, socket, sender, payload.receiverId, content);
        }
        return;
    }
  });
}

/** Ephemeral: tidak disimpan ke DB. Terdengar di zona meeting yang sama, atau jarak ≤ radius di open-space. */
function sendProximity(io: Server, sender: PlayerState, content: string) {
  const packet = {
    id: randomUUID(),
    channel: "PROXIMITY",
    senderId: sender.userId,
    senderName: sender.fullName,
    content,
    createdAt: new Date().toISOString(),
  };

  for (const target of activePlayers.values()) {
    if (target.roomId !== sender.roomId) continue;
    if (canHearProximity(sender, target)) {
      io.to(target.socketId).emit("chat:receive", packet);
    }
  }
}

function canHearProximity(sender: PlayerState, target: PlayerState): boolean {
  const sameMeetingZone =
    sender.zone !== ZONE.OPEN_SPACE && sender.zone === target.zone;

  const withinRadius =
    sender.zone === ZONE.OPEN_SPACE &&
    target.zone === ZONE.OPEN_SPACE &&
    getDistanceXZ(sender.position, target.position) <= PROXIMITY_CHAT_RADIUS;

  return sameMeetingZone || withinRadius;
}

/** Disimpan ke DB lalu di-broadcast ke seluruh workspace */
async function sendGlobal(io: Server, sender: PlayerState, content: string) {
  const saved = await prisma.message.create({
    data: {
      workspaceId: sender.workspaceId,
      roomId: sender.roomId,
      senderId: sender.userId,
      content,
    },
  });

  io.to(workspaceChannel(sender.workspaceId)).emit("chat:receive", {
    id: saved.id,
    channel: "GLOBAL",
    senderId: sender.userId,
    senderName: sender.fullName,
    content: saved.content,
    createdAt: saved.createdAt,
  });
}

/** Whisper: disimpan ke DirectMessage, dikirim ke penerima dan pengirim */
async function sendPrivate(
  io: Server,
  socket: Socket,
  sender: PlayerState,
  receiverId: string,
  content: string,
) {
  const saved = await prisma.directMessage.create({
    data: {
      workspaceId: sender.workspaceId,
      senderId: sender.userId,
      receiverId,
      content,
    },
  });

  const packet = {
    id: saved.id,
    channel: "PRIVATE",
    senderId: sender.userId,
    senderName: sender.fullName,
    receiverId,
    content: saved.content,
    createdAt: saved.createdAt,
  };

  io.to(userChannel(receiverId)).emit("chat:receive", packet);
  socket.emit("chat:receive", packet);
}
