// src/npc/pedestrians.ts
// Pejalan kaki di trotoar. Berhenti saat ada pemain di dekatnya dan bisa diklik untuk mengobrol.
import { Npc, nearest, type StepContext } from "./base.js";
import { rnd, turnToward } from "./util.js";

const WALK_LANES = [
  { z: 14.8, minX: -35, maxX: 35 },
  { z: -21.2, minX: -35, maxX: 35 },
];

interface WalkerSpec {
  laneIdx: number;
  startX: number;
  startZ: number;
  dir: 1 | -1;
  speed: number;
  lineCount: number;
}

const WALKERS: WalkerSpec[] = Array.from({ length: 8 }, (_, i) => {
  const laneIdx = i % 2;
  const lane = WALK_LANES[laneIdx];
  const slot = Math.floor(i / 2);
  return {
    laneIdx,
    startX: lane.minX + ((slot + 0.5) / 4) * (lane.maxX - lane.minX),
    startZ: lane.z + (slot % 2 === 0 ? 0.35 : -0.35),
    dir: (slot % 2 === 0 ? 1 : -1) as 1 | -1,
    speed: 1.05 + rnd(i, 1) * 0.55,
    lineCount: 2,
  };
});

class Walker extends Npc {
  private dir: 1 | -1;
  private pauseTimer = 0;
  private nextPauseIn: number;

  constructor(
    id: string,
    private readonly spec: WalkerSpec,
  ) {
    super(id);
    this.dir = spec.dir;
    this.x = spec.startX;
    this.z = spec.startZ;
    this.yaw = spec.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    this.nextPauseIn = 4 + rnd(spec.startX, 3) * 6;
  }

  click(now: number): void {
    // Klik selalu pindah ke baris dialog berikutnya dan memperpanjang bubble
    const next = this.talk < 0 ? 0 : (this.talk + 1) % this.spec.lineCount;
    this.say(next, now, 3000);
  }

  update(ctx: StepContext): void {
    const dt = Math.min(ctx.dt, 0.05);
    const p = nearest(ctx.players, this.x, this.spec.startZ);
    const isNear = !!p && p.dist < 2.4;
    this.greetOnApproach(isNear, 0, ctx.nowMs, 3000);

    const talking = this.isTalking();
    if (!talking) {
      this.nextPauseIn -= dt;
      if (this.nextPauseIn <= 0) {
        this.pauseTimer = 1.5 + rnd(Math.floor(ctx.nowSec), 7) * 1.5;
        this.nextPauseIn = 6 + rnd(Math.floor(ctx.nowSec), 9) * 6;
      }
    }

    if (talking || this.pauseTimer > 0) {
      if (!talking) this.pauseTimer -= dt;
      const target =
        talking && p
          ? Math.atan2(p.dx, p.dz)
          : this.dir > 0
            ? Math.PI / 2
            : -Math.PI / 2;
      this.yaw = turnToward(this.yaw, target, 0.14);
      this.y = Math.sin(ctx.nowSec * 2) * 0.006;
      this.anim = 0;
      return;
    }

    this.x += this.dir * this.spec.speed * dt;
    const lane = WALK_LANES[this.spec.laneIdx];
    if (this.x >= lane.maxX) {
      this.x = lane.maxX;
      this.dir = -1;
    } else if (this.x <= lane.minX) {
      this.x = lane.minX;
      this.dir = 1;
    }
    const target = this.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    this.yaw = turnToward(this.yaw, target, 0.18);
    this.y = Math.abs(Math.sin(ctx.nowSec * this.spec.speed * 6)) * 0.025;
    this.anim = 1;
  }
}

export function createPedestrians(): {
  walkers: Npc[];
  update: (ctx: StepContext) => void;
} {
  const walkers = WALKERS.map((s, i) => new Walker(`walker-${i}`, s));
  return {
    walkers,
    update: (ctx) => {
      for (const w of walkers) w.update(ctx);
    },
  };
}
