// src/npc/autonomous.ts
// NPC yang punya jadwal sendiri: jalan, duduk, berkunjung, dan naik trem.
// Dialog ada di client; server hanya mengirim indeks langkah jadwal (talk).
import { platformY, riderWorldPos, FLOOR_Y } from "./geometry.js";
import { Npc, nearest, type StepContext } from "./base.js";

export type Step =
  | { kind: "sit"; x: number; z: number; rotY: number; duration: number }
  | { kind: "visit"; x: number; z: number; rotY: number; duration: number }
  | { kind: "tram"; waitX: number; waitZ: number; rx: number; rz: number; duration: number };

export interface AutonomousSpec {
  id: string;
  start: [number, number];
  schedule: Step[];
}

const T = Math.PI;

export const AUTONOMOUS_SPECS: AutonomousSpec[] = [
  {
    id: "rama",
    start: [-5.5, 45.8],
    schedule: [
      { kind: "tram", waitX: -5.5, waitZ: 47.2, rx: -0.35, rz: -4.2, duration: 14 },
      { kind: "sit", x: -8, z: 13.4, rotY: T, duration: 7 },
      { kind: "sit", x: -20.0, z: 32.5, rotY: T / 2, duration: 8 },
      { kind: "visit", x: 27.5, z: 11.5, rotY: T, duration: 5 },
    ],
  },
  {
    id: "tara",
    start: [-2.5, 46.2],
    schedule: [
      { kind: "tram", waitX: -2.5, waitZ: 47.2, rx: 0.35, rz: -2.0, duration: 14 },
      { kind: "sit", x: -16, z: 36.5, rotY: T, duration: 8 },
      { kind: "sit", x: 6, z: 13.4, rotY: T, duration: 7 },
      { kind: "visit", x: -12.65, z: 11.5, rotY: T, duration: 5 },
    ],
  },
  {
    id: "nando",
    start: [0.5, 45.5],
    schedule: [
      { kind: "tram", waitX: 0.5, waitZ: 47.2, rx: -0.35, rz: 0.4, duration: 14 },
      { kind: "sit", x: 28, z: 13.4, rotY: T, duration: 7 },
      { kind: "visit", x: -30.85, z: 11.5, rotY: T, duration: 5 },
      { kind: "sit", x: -12.0, z: 32.5, rotY: -T / 2, duration: 7 },
    ],
  },
  {
    id: "salsa",
    start: [3.5, 46.0],
    schedule: [
      { kind: "tram", waitX: 3.5, waitZ: 47.2, rx: 0.35, rz: 2.6, duration: 14 },
      { kind: "sit", x: -16, z: 28.5, rotY: 0, duration: 7 },
      { kind: "visit", x: 8.7, z: 11.5, rotY: T, duration: 5 },
    ],
  },
  {
    id: "yoga",
    start: [6.5, 45.8],
    schedule: [
      { kind: "tram", waitX: 6.5, waitZ: 47.2, rx: -0.35, rz: -6.5, duration: 14 },
      { kind: "sit", x: 6, z: -22.9, rotY: 0, duration: 7 },
      { kind: "visit", x: 0, z: 32.5, rotY: -T / 2, duration: 5 },
    ],
  },
];

type Phase = "walk" | "act" | "wait_tram" | "ride_tram";

export class AutonomousNpc extends Npc {
  private stepIdx = 0;
  private phase: Phase = "walk";
  private timer = 0;
  private rideTimer = 0;
  private wasNear = false;

  constructor(private readonly spec: AutonomousSpec) {
    super(spec.id);
    this.x = spec.start[0];
    this.z = spec.start[1];
    this.y = platformY(this.x, this.z);
  }

  click(now: number): void {
    if (!this.isTalking()) this.say(this.stepIdx, now, 4000);
  }

  private get step(): Step {
    return this.spec.schedule[this.stepIdx];
  }

  update(ctx: StepContext): void {
    const dt = Math.min(ctx.dt, 0.05);
    const t = ctx.nowSec;
    const p = nearest(ctx.players, this.x, this.z);
    const isNear = !!p && p.dist < 2.5;
    if (isNear && !this.wasNear && !this.isTalking()) this.say(this.stepIdx, ctx.nowMs, 4000);
    this.wasNear = isNear;

    const step = this.step;
    const talking = this.isTalking();
    this.anim = 0;

    // Naik trem: ikut bergerak bersama gerbong
    if (this.phase === "ride_tram") {
      this.anim = 0;
      this.ride = 1;
      if (step.kind !== "tram") return;
      const [tx, tz] = riderWorldPos(ctx.tram.head, step.rx, step.rz);
      this.x = tx;
      this.z = tz;
      this.y = FLOOR_Y;
      this.yaw = Math.PI / 2;
      this.rideTimer += dt;
      if (this.rideTimer >= step.duration && ctx.tram.dwell > 0) {
        this.ride = 0;
        this.x = step.waitX;
        this.z = step.waitZ;
        this.y = platformY(this.x, this.z);
        this.phase = "walk";
        this.stepIdx = (this.stepIdx + 1) % this.spec.schedule.length;
      }
      return;
    }
    this.ride = 0;

    // Menunggu trem di peron
    if (this.phase === "wait_tram") {
      this.y = platformY(this.x, this.z);
      this.yaw = isNear && p ? Math.atan2(p.dx, p.dz) : 0;
      if (ctx.tram.dwell > 0) {
        this.phase = "ride_tram";
        this.rideTimer = 0;
      }
      return;
    }

    // Duduk atau berkunjung
    if (this.phase === "act" && step.kind !== "tram") {
      this.timer -= dt;
      const isSit = step.kind === "sit";
      this.anim = isSit ? 2 : 0;
      this.y = platformY(this.x, this.z) + (isSit ? 0 : Math.sin(t * 2) * 0.005);
      if (isSit) this.yaw = step.rotY;
      else this.yaw = isNear && p ? Math.atan2(p.dx, p.dz) : step.rotY;
      if (this.timer <= 0 && !isNear) {
        this.phase = "walk";
        this.stepIdx = (this.stepIdx + 1) % this.spec.schedule.length;
      }
      return;
    }

    // Berjalan menuju tujuan (menyeberang jalan lewat zebra cross x = 0)
    const destX = step.kind === "tram" ? step.waitX : step.x;
    const destZ = step.kind === "tram" ? step.waitZ : step.z;
    let targetX = destX;
    let targetZ = destZ;

    const crossesSouthFromNorth = this.z < 18.2 && destZ > 25.8;
    const crossesSouthFromSouth = this.z > 25.8 && destZ < 18.2;

    if (crossesSouthFromNorth) {
      if (Math.abs(this.x) > 0.7 && this.z < 18.0) {
        targetX = 0;
        targetZ = 17.6;
      } else {
        if (this.z >= 17.2 && this.z < 18.5 && ctx.signal === "green") {
          this.y = platformY(this.x, this.z);
          this.yaw = 0;
          return;
        }
        targetX = 0;
        targetZ = 26.4;
      }
    } else if (crossesSouthFromSouth) {
      if (Math.abs(this.x) > 0.7 && this.z > 26.0) {
        targetX = 0;
        targetZ = 26.4;
      } else {
        if (this.z <= 26.8 && this.z > 25.5 && ctx.signal === "green") {
          this.y = platformY(this.x, this.z);
          this.yaw = Math.PI;
          return;
        }
        targetX = 0;
        targetZ = 17.6;
      }
    }

    // Berhenti dan menghadap pemain saat sedang diajak bicara
    if (isNear && talking && p) {
      this.y = platformY(this.x, this.z);
      this.yaw = Math.atan2(p.dx, p.dz);
      return;
    }

    const dx = targetX - this.x;
    const dz = targetZ - this.z;
    const dist = Math.hypot(dx, dz);

    if (dist < 0.25) {
      this.x = targetX;
      this.z = targetZ;
      if (targetX === destX && targetZ === destZ) {
        if (step.kind === "tram") this.phase = "wait_tram";
        else {
          this.phase = "act";
          this.timer = step.duration;
        }
      }
      return;
    }

    const speed = 1.65;
    const move = Math.min(dist, speed * dt);
    this.x += (dx / dist) * move;
    this.z += (dz / dist) * move;
    this.yaw = Math.atan2(dx, dz);
    this.y = platformY(this.x, this.z) + Math.abs(Math.sin(t * 7)) * 0.025;
    this.anim = 1;
  }
}

export function createAutonomous(): { npcs: Npc[]; update: (ctx: StepContext) => void } {
  const npcs = AUTONOMOUS_SPECS.map((s) => new AutonomousNpc(s));
  return {
    npcs,
    update: (ctx) => {
      for (const n of npcs) n.update(ctx);
    },
  };
}

