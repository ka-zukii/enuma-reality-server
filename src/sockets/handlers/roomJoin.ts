import type { Profile } from "@prisma/client";
import type { Server, Socket } from "socket.io";
import { prisma } from "../../config/clients.js";
import { ZONE } from "../../config/layouts.js";
import { ensureMembership } from "../../services/membership.js";
import { markExteriorRoom } from "../../npc/world.js";
import { canJoin, releaseSeat } from "../../services/serverAllocator.js";
import { cancelWorkspaceCleanup } from "../../services/workspaceCleanup.js";
import { cancelDisconnectGrace } from "../../services/playerLifecycle.js";
import {
  activePlayers,
  PlayerAnimation,
  PlayerState,
  PlayerStatus,
  Position,
  roomChannel,
  userChannel,
  workspaceChannel,
} from "../../state/presence.js";
import { onEvent } from "../guard.js";

export type JoinMode = "auto" | "code";

export interface RoomJoinPayload {
  workspaceId: string;
  roomId: string;
  mode?: JoinMode;
  currentPosition?: Position;
  rotationY?: number;
}

/** State pemain yang dibawa dari sesi sebelumnya (reconnect / pindah room / kembali dari idle) */
interface CarriedState {
  position: Position;
  rotationY: number;
  animation: PlayerAnimation;
  zone: string;
  status: PlayerStatus;
}

const defaultSpawn = (): Position => [0, 0, 3];

export function registerRoomJoin(io: Server, socket: Socket): void {
  onEvent<Partial<RoomJoinPayload>>(socket, "room:join", async (payload) => {
    const profile = socket.data.profile as Profile;
    const data: Partial<RoomJoinPayload> = payload ?? {};
    const { workspaceId, roomId, currentPosition, rotationY } = data;
    const mode: JoinMode = data.mode === "auto" ? "auto" : "code";

    if (!workspaceId || !roomId) {
      return fail(socket, "Data ruangan tidak lengkap.");
    }

    // 1a. Room harus ada dan milik workspace yang sama
    const room = await prisma.room.findUnique({ where: { id: roomId } });
    if (room && !room.buildingKey) markExteriorRoom(roomId);
    if (!room || room.workspaceId !== workspaceId) {
      return fail(socket, "Ruangan tidak valid.");
    }

    // 1b. Pastikan user terdaftar sebagai member, ambil role dan jabatannya
    const membership = await ensureMembership(
      workspaceId,
      profile.id,
      socket.data.isGuest === true,
    );

    const joinedChannels = [
      roomChannel(roomId),
      workspaceChannel(workspaceId),
      userChannel(profile.id),
    ];
    await socket.join(joinedChannels);

    // 1c. Cek kapasitas. Dari sini sampai activePlayers.set TIDAK boleh ada `await`,
    // supaya dua pemain yang masuk bersamaan tidak lolos bersamaan (race condition).
    if (!canJoin(workspaceId, profile.id, mode)) {
      leaveAll(socket, joinedChannels);
      socket.emit("server:full", { workspaceId, mode });
      return;
    }

    releaseSeat(workspaceId, profile.id);
    cancelWorkspaceCleanup(workspaceId);

    // 1d. Ambil state lama pemain (termasuk sesi yang sedang reconnecting)
    const carried = takeOverPreviousSessions(
      io,
      profile.id,
      { workspaceId, roomId },
      { currentPosition, rotationY },
    );

    // 1e. Keluarkan socket dari room lama agar tidak menerima tick room lain
    leaveOtherRoomChannels(socket, roomChannel(roomId));

    const newPlayer: PlayerState = {
      socketId: socket.id,
      userId: profile.id,
      fullName: profile.fullName,
      avatarUrl: profile.avatarUrl,
      avatarConfig: (profile.avatarConfig as Record<string, any>) || {},
      workspaceId,
      roomId,
      position: carried.position,
      rotationY: carried.rotationY,
      animation: carried.animation,
      zone: carried.zone,
      isMicOn: false,
      isCamOn: false,
      role: membership.role,
      jobTitle: membership.jobTitle,
      status: carried.status,
      lastActiveAt: Date.now(),
      connectionState: "connected",
    };
    activePlayers.set(socket.id, newPlayer);

    // 1f. Kirim daftar pemain di room ini ke user baru, lalu beri tahu yang lain
    const playersInRoom = [...activePlayers.values()].filter(
      (p) => p.roomId === roomId,
    );
    socket.emit("room:state", playersInRoom);
    socket.to(roomChannel(roomId)).emit("player:joined", newPlayer);
  });
}

/**
 * Hapus sesi lama milik user yang sama (termasuk yang sedang reconnecting).
 * State posisi dibawa jika room-nya sama. `player:left` selalu dikirim untuk socket lama,
 * karena client menyimpan avatar berdasarkan socketId.
 */
function takeOverPreviousSessions(
  io: Server,
  userId: string,
  target: { workspaceId: string; roomId: string },
  requested: { currentPosition?: Position; rotationY?: number },
): CarriedState {
  const carried: CarriedState = {
    position: requested.currentPosition ?? defaultSpawn(),
    rotationY: requested.rotationY ?? 0,
    animation: "idle",
    zone: ZONE.DEFAULT,
    status: "LIVE",
  };

  for (const [socketId, p] of activePlayers.entries()) {
    if (p.userId !== userId) continue;

    const sameRoom =
      p.workspaceId === target.workspaceId && p.roomId === target.roomId;

    if (sameRoom) {
      if (!requested.currentPosition) carried.position = p.position;
      if (requested.rotationY === undefined) carried.rotationY = p.rotationY;
      carried.animation = p.animation;
      carried.zone = p.zone;
      carried.status = p.status;
    }

    cancelDisconnectGrace(socketId);
    activePlayers.delete(socketId);

    io.to(roomChannel(p.roomId)).emit("player:left", {
      socketId,
      userId,
    });
  }

  return carried;
}

function leaveOtherRoomChannels(socket: Socket, keep: string): void {
  for (const key of Array.from(socket.rooms)) {
    if (key.startsWith("room:") && key !== keep) socket.leave(key);
  }
}

function leaveAll(socket: Socket, channels: string[]): void {
  for (const ch of channels) socket.leave(ch);
}

function fail(socket: Socket, message: string): void {
  socket.emit("error:message", message);
}
