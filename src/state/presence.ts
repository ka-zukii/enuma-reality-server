import type { MemberRole } from "@prisma/client";

/**
 * Harus sama dengan tipe PlayerStatus di web/src/types/index.ts.
 * Status yang tidak ada di daftar ini diabaikan server (player:status).
 * Catatan: "Tamu" adalah role (GUEST), bukan status.
 */
export const PLAYER_STATUSES = [
  "LIVE",
  "PAGI",
  "SORE",
  "MALAM",
  "STANDUP",
  "ISTIRAHAT",
] as const;
export type PlayerStatus = (typeof PLAYER_STATUSES)[number];

/** Harus sama dengan tipe animation di web (idle, walk, sit). */
export const PLAYER_ANIMATIONS = ["idle", "walk", "sit"] as const;
export type PlayerAnimation = (typeof PLAYER_ANIMATIONS)[number];

export function isPlayerAnimation(value: unknown): value is PlayerAnimation {
  return (PLAYER_ANIMATIONS as readonly unknown[]).includes(value);
}

export type Position = [number, number, number];

/** "connected": socket aktif. "reconnecting": socket putus, avatar ditahan selama grace period. */
export type ConnectionState = "connected" | "reconnecting";

/** Posisi penumpang di dalam kabin trem (lokal, origin = pusat kepala trem). */
export interface RideState {
  rx: number;
  rz: number;
}

export interface PlayerState {
  socketId: string;
  userId: string;
  fullName: string;
  avatarUrl: string | null;
  avatarConfig: Record<string, any>;
  workspaceId: string;
  roomId: string;
  position: Position;
  rotationY: number;
  animation: PlayerAnimation;
  zone: string;
  /** null jika berjalan di luar trem */
  ride?: RideState | null;
  isMicOn: boolean;
  isCamOn: boolean;
  role: MemberRole;
  jobTitle: string | null;
  status: PlayerStatus;
  /** Timestamp (ms) aktivitas terakhir pemain. Dipakai untuk deteksi pemain tidak aktif. */
  lastActiveAt: number;
  connectionState: ConnectionState;
}

/** Key: socket.id -> Value: PlayerState. Sumber kebenaran pemain online (in-memory). */
export const activePlayers = new Map<string, PlayerState>();

export function countOnlinePlayersInWorkspace(workspaceId: string): number {
  let count = 0;
  for (const player of activePlayers.values()) {
    if (player.workspaceId === workspaceId) count++;
  }
  return count;
}

/** Jarak Euclidean 2D (bidang X dan Z) */
export function getDistanceXZ(a: Position, b: Position): number {
  const dx = a[0] - b[0];
  const dz = a[2] - b[2];
  return Math.sqrt(dx * dx + dz * dz);
}

// Nama channel Socket.IO, dipusatkan agar tidak ada string yang ditulis manual
export const roomChannel = (roomId: string) => `room:${roomId}`;
export const workspaceChannel = (workspaceId: string) =>
  `workspace:${workspaceId}`;
export const userChannel = (userId: string) => `user:${userId}`;
