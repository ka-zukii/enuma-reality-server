export const PLAYER_STATUSES = [
  "LIVE",
  "PAGI",
  "STANDUP",
  "ISTIRAHAT",
  "TAMU",
] as const;
export type PlayerStatus = (typeof PLAYER_STATUSES)[number];

export interface PlayerState {
  socketId: string;
  userId: string;
  fullName: string;
  avatarUrl: string | null;
  avatarConfig: Record<string, any>;
  workspaceId: string;
  roomId: string;
  position: [number, number, number];
  rotationY: number;
  animation: "idle" | "walk";
  zone: string; // 'open-space' | 'meeting-room-1' | dll
  isMicOn: boolean;
  isCamOn: boolean;
  role: "OWNER" | "ADMIN" | "MEMBER" | "GUEST";
  jobTitle: string | null;
  status: PlayerStatus;
}

// Key: socket.id -> Value: PlayerState
export const activePlayers = new Map<string, PlayerState>();

// Helper menghitung jumlah player online di suatu workspace
export function countOnlinePlayersInWorkspace(workspaceId: string): number {
  let count = 0;
  for (const player of activePlayers.values()) {
    if (player.workspaceId === workspaceId) {
      count++;
    }
  }
  return count;
}

// Helper menghitung jarak Euclidean 2D (bidang X dan Z)
export function getDistanceXZ(
  posA: [number, number, number],
  posB: [number, number, number],
): number {
  const dx = posA[0] - posB[0];
  const dz = posA[2] - posB[2];
  return Math.sqrt(dx * dx + dz * dz);
}
