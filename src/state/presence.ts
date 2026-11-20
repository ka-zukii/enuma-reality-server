import type { MemberRole } from "@prisma/client";

export const PLAYER_STATUSES = [
  "LIVE",
  "PAGI",
  "STANDUP",
  "ISTIRAHAT",
  "TAMU",
] as const;
export type PlayerStatus = (typeof PLAYER_STATUSES)[number];

export type Position = [number, number, number];

/** "connected": socket aktif. "reconnecting": socket putus, avatar ditahan selama grace period. */
export type ConnectionState = "connected" | "reconnecting";

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
  animation: "idle" | "walk";
  zone: string;
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
