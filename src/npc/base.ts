// src/npc/base.ts
// Kerangka NPC: pose, bicara (bubble), dan konteks langkah simulasi.
import type { TramSnapshot } from "../services/tram.js";

export type Anim = 0 | 1 | 2; // 0 diam, 1 jalan, 2 duduk
export type Signal = "green" | "yellow" | "red";

export interface PlayerPoint {
  x: number;
  z: number;
}

export interface StepContext {
  nowMs: number;
  nowSec: number;
  dt: number;
  players: PlayerPoint[];
  signal: Signal;
  tram: TramSnapshot;
}

export interface NearInfo {
  dist: number;
  dx: number;
  dz: number;
}

/** Pemain terdekat dari (x, z). Null jika tidak ada pemain di room. */
export function nearest(
  players: PlayerPoint[],
  x: number,
  z: number,
): NearInfo | null {
  let best: NearInfo | null = null;
  for (const p of players) {
    const dx = p.x - x;
    const dz = p.z - z;
    const dist = Math.hypot(dx, dz);
    if (!best || dist < best.dist) best = { dist, dx, dz };
  }
  return best;
}

export abstract class Npc {
  x = 0;
  y = 0;
  z = 0;
  yaw = 0;
  anim: Anim = 0;
  /** 1 jika sedang di dalam trem */
  ride: 0 | 1 = 0;
  /**
   * Indeks baris dialog/aksi yang sedang ditampilkan (-1 = diam).
   * Untuk NPC otonom ini adalah indeks langkah jadwal; untuk kucing 0 = "meow".
   */
  talk = -1;
  private talkUntil = 0;
  private wasNear = false;
  private greetCooldownUntil = 0;

  constructor(readonly id: string) {}

  protected say(index: number, now: number, durationMs: number): void {
    this.talk = index;
    this.talkUntil = now + durationMs;
  }

  protected greetOnApproach(
    isNear: boolean,
    index: number,
    now: number,
    durationMs = 3000,
    cooldownMs = 8000,
  ): void {
    if (
      isNear &&
      !this.wasNear &&
      !this.isTalking() &&
      now >= this.greetCooldownUntil
    ) {
      this.say(index, now, durationMs);
      this.greetCooldownUntil = now + durationMs + cooldownMs;
    }
    this.wasNear = isNear;
  }

  protected isTalking(): boolean {
    return this.talk >= 0;
  }

  /** Hapus bubble yang sudah melewati durasinya. Dipanggil sekali per langkah. */
  expireTalk(now: number): void {
    if (this.talk >= 0 && now >= this.talkUntil) this.talk = -1;
  }

  /** Dipanggil saat pemain mengklik NPC. */
  click(_now: number): void {}

  abstract update(ctx: StepContext): void;
}

/** NPC yang posenya ditentukan oleh sistem lain (misalnya lalu lintas). */
export class PassiveNpc extends Npc {
  update(_ctx: StepContext): void {}
}
