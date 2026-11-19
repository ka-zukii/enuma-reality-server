import type { Prisma } from "@prisma/client";

export const DEFAULT_MAP_TEMPLATE = "enuma-office-3floor";

export const ZONE = {
  OPEN_SPACE: "open-space",
  DEFAULT: "jalan-utama",
  MEETING_ROOM_A: "meeting-room-1",
} as const;

/** Layout default untuk Main Floor (server manual & otomatis) */
export function officeRoomLayout(): Prisma.InputJsonObject {
  return {
    spawnPoint: [0, 0, 4],
    zones: [
      {
        id: ZONE.MEETING_ROOM_A,
        name: "Meeting Room A",
        bounds: { minX: -5.5, maxX: -1.5, minZ: -6.5, maxZ: -2.5 },
      },
    ],
    objects: [],
  };
}

/** Layout default untuk interior gedung */
export function interiorRoomLayout(): Prisma.InputJsonObject {
  return { spawnPoint: [0, 0, 0], zones: [], objects: [] };
}
