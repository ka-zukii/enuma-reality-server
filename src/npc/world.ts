// src/npc/world.ts
// Satu dunia NPC per room kota. Server menjalankan simulasinya dan mengirim
// posisi yang sama ke semua pemain di room, sehingga tampilannya selalu sinkron.
import { getTrafficSignal } from "./traffic.js";
import type { Npc, PlayerPoint, StepContext } from "./base.js";
import { createCityNpcs } from "./city.js";
import { round3 } from "./util.js";
import type { TramSnapshot } from "../services/tram.js";

/** Satu NPC dalam snapshot: [id, x, y, z, yaw, anim, ride, talk] */
export type NpcTuple = [string, number, number, number, number, number, number, number];

export interface NpcSnapshot {
  /** Waktu server (ms) saat snapshot dihitung */
  t: number;
  signal: "green" | "yellow" | "red";
  npcs: NpcTuple[];
}

/** Kirim snapshot setiap N langkah simulasi (20 Hz simulasi -> 10 Hz kirim). */
const BROADCAST_EVERY = 2;
const MAX_DT = 0.05;

const exteriorRooms = new Set<string>();
const worlds = new Map<string, NpcWorld>();

/** Tandai room sebagai kota (dipanggil saat pemain masuk room tanpa gedung). */
export function markExteriorRoom(roomId: string): void {
  exteriorRooms.add(roomId);
}

export function isExteriorRoom(roomId: string): boolean {
  return exteriorRooms.has(roomId);
}

export function getNpcWorld(roomId: string, nowMs: number): NpcWorld {
  let w = worlds.get(roomId);
  if (!w) {
    w = new NpcWorld(nowMs);
    worlds.set(roomId, w);
  }
  return w;
}

/** Hapus dunia NPC dari room yang sudah kosong. */
export function pruneNpcWorlds(activeRoomIds: Set<string>): void {
  for (const roomId of worlds.keys()) {
    if (!activeRoomIds.has(roomId)) worlds.delete(roomId);
  }
}

export class NpcWorld {
  private readonly npcs: Npc[];
  private readonly updaters: ((ctx: StepContext) => void)[];
  private lastMs: number;
  private sinceBroadcast = 0;
  private snapshotCache: NpcSnapshot | null = null;

  constructor(nowMs: number) {
    const city = createCityNpcs();
    this.npcs = city.npcs;
    this.updaters = city.updaters;
    this.lastMs = nowMs;
  }

  /** Majukan simulasi sampai `nowMs`. Dipanggil dari game loop. */
  step(nowMs: number, players: PlayerPoint[], tram: TramSnapshot): void {
    const dt = Math.min(MAX_DT, Math.max(0, (nowMs - this.lastMs) / 1000));
    this.lastMs = nowMs;
    const ctx: StepContext = {
      nowMs,
      nowSec: nowMs / 1000,
      dt,
      players,
      signal: getTrafficSignal(nowMs / 1000),
      tram,
    };
    for (const n of this.npcs) n.expireTalk(nowMs);
    for (const u of this.updaters) u(ctx);
    this.snapshotCache = null;
    this.sinceBroadcast++;
  }

  /** true jika snapshot sudah waktunya dikirim ke client. */
  shouldBroadcast(): boolean {
    if (this.sinceBroadcast < BROADCAST_EVERY) return false;
    this.sinceBroadcast = 0;
    return true;
  }

  snapshot(nowMs: number): NpcSnapshot {
    if (!this.snapshotCache) {
      this.snapshotCache = {
        t: nowMs,
        signal: getTrafficSignal(nowMs / 1000),
        npcs: this.npcs.map((n) => [
          n.id,
          round3(n.x),
          round3(n.y),
          round3(n.z),
          round3(n.yaw),
          n.anim,
          n.ride,
          n.talk,
        ]),
      };
    }
    return { ...this.snapshotCache, t: nowMs };
  }

  /** Klik NPC oleh pemain. Mengembalikan true jika NPC ditemukan. */
  interact(npcId: string, nowMs: number): boolean {
    const npc = this.npcs.find((n) => n.id === npcId);
    if (!npc) return false;
    npc.click(nowMs);
    return true;
  }
}
