import { prisma } from "../config/clients.js";
import {
  AUTO_JOIN_CAP,
  HARD_CAP,
  RESERVATION_TTL_MS,
} from "../config/settings.js";
import { activePlayers } from "../state/presence.js";
import { createAutoServer } from "./workspaces.js";

// workspaceId -> (userId -> waktu kedaluwarsa)
const reservations = new Map<string, Map<string, number>>();

// Antrean sederhana agar pencarian/pembuatan server otomatis berjalan satu per satu
let queue: Promise<unknown> = Promise.resolve();
function exclusive<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn, fn);
  queue = run.catch(() => undefined);
  return run;
}

/** Jumlah pemain unik (online + reservasi aktif), tidak termasuk exceptUserId */
export function occupancy(workspaceId: string, exceptUserId?: string): number {
  const users = new Set<string>();

  for (const p of activePlayers.values()) {
    if (p.workspaceId === workspaceId) users.add(p.userId);
  }

  const now = Date.now();
  const res = reservations.get(workspaceId);
  if (res) {
    for (const [uid, expiresAt] of res) {
      if (expiresAt > now) users.add(uid);
      else res.delete(uid);
    }
  }

  if (exceptUserId) users.delete(exceptUserId);
  return users.size;
}

export function canJoin(
  workspaceId: string,
  userId: string,
  mode: "auto" | "code",
): boolean {
  const limit = mode === "auto" ? AUTO_JOIN_CAP : HARD_CAP;
  return occupancy(workspaceId, userId) < limit;
}

export function reserveSeat(workspaceId: string, userId: string): void {
  let res = reservations.get(workspaceId);
  if (!res) {
    res = new Map();
    reservations.set(workspaceId, res);
  }
  res.set(userId, Date.now() + RESERVATION_TTL_MS);
}

export function releaseSeat(workspaceId: string, userId: string): void {
  reservations.get(workspaceId)?.delete(userId);
}

/** Dari daftar server otomatis, pilih yang paling ramai tapi belum penuh (AUTO_JOIN_CAP) */
function pickFullestAvailable<T extends { id: string }>(
  servers: T[],
  userId: string,
): T | undefined {
  return servers
    .map((ws) => ({ ws, count: occupancy(ws.id, userId) }))
    .filter((c) => c.count < AUTO_JOIN_CAP)
    .sort((a, b) => b.count - a.count)[0]?.ws;
}

/**
 * Pilih server untuk quick join:
 * 1. Server otomatis yang pemainnya < AUTO_JOIN_CAP (dimulai dari yang paling ramai)
 * 2. Jika tidak ada, buat server baru
 * Kursi pemain langsung dicadangkan.
 */
export function findOrCreateAutoServer(userId: string) {
  return exclusive(async () => {
    const autoServers = await prisma.workspace.findMany({
      where: { isAuto: true },
      include: { rooms: true },
      orderBy: { createdAt: "asc" },
    });

    const target =
      pickFullestAvailable(autoServers, userId) ??
      (await createAutoServer(autoServers.length + 1));

    reserveSeat(target.id, userId);
    return target;
  });
}
