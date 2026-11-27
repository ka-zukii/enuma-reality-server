// src/npc/cats.ts
// Kucing kota: berjalan antar-waypoint, berhenti sebentar, dan mengeong saat ada pemain di dekatnya.
import { Npc, nearest, type StepContext } from "./base.js";
import { rnd, turnToward } from "./util.js";

interface CatSpec {
  id: string;
  speed: number;
  waypoints: [number, number][];
}

const CAT_SPECS: CatSpec[] = [
  {
    id: "cat-oyen",
    speed: 0.95,
    waypoints: [
      [-34.0, 11.2],
      [-28.0, 11.2],
      [-28.5, 13.0],
      [-33.5, 12.8],
    ],
  },
  {
    id: "cat-milo",
    speed: 0.9,
    waypoints: [
      [-20.2, 28.8],
      [-11.8, 28.8],
      [-11.8, 36.2],
      [-20.2, 36.2],
    ],
  },
  {
    id: "cat-snowy",
    speed: 0.9,
    waypoints: [
      [25.0, 11.2],
      [33.2, 11.2],
      [33.2, 13.0],
      [25.0, 13.0],
    ],
  },
];

class CityCat extends Npc {
  private wpIdx = 1;
  private wait = 0;

  constructor(
    id: string,
    private readonly spec: CatSpec,
  ) {
    super(id);
    this.x = spec.waypoints[0][0];
    this.z = spec.waypoints[0][1];
  }

  click(now: number): void {
    if (!this.isTalking()) this.say(0, now, 3000);
  }

  update(ctx: StepContext): void {
    const dt = Math.min(ctx.dt, 0.05);
    const p = nearest(ctx.players, this.x, this.z);
    const isNear = !!p && p.dist < 2.2;
    this.greetOnApproach(isNear, 0, ctx.nowMs, 3000);

    // Saat mengeong, kucing menghadap pemain dan diam
    if (this.isTalking()) {
      if (p) this.yaw = turnToward(this.yaw, Math.atan2(p.dx, p.dz), 0.14);
      this.anim = 0;
      this.y = 0;
      return;
    }

    if (this.wait > 0) {
      this.wait -= dt;
      this.anim = 0;
      return;
    }

    const [tx, tz] = this.spec.waypoints[this.wpIdx];
    const dx = tx - this.x;
    const dz = tz - this.z;
    const dist = Math.hypot(dx, dz);

    if (dist < 0.15) {
      this.x = tx;
      this.z = tz;
      this.wpIdx = (this.wpIdx + 1) % this.spec.waypoints.length;
      this.wait = 1.5 + rnd(this.wpIdx, 4) * 2.0;
      this.anim = 0;
      return;
    }

    const step = Math.min(dist, this.spec.speed * dt);
    this.x += (dx / dist) * step;
    this.z += (dz / dist) * step;
    this.yaw = turnToward(this.yaw, Math.atan2(dx, dz), 0.16);
    this.y = Math.abs(Math.sin(ctx.nowSec * 9)) * 0.014;
    this.anim = 1;
  }
}

export function createCats(): {
  cats: Npc[];
  update: (ctx: StepContext) => void;
} {
  const cats = CAT_SPECS.map((s) => new CityCat(s.id, s));
  return {
    cats,
    update: (ctx) => {
      for (const c of cats) c.update(ctx);
    },
  };
}
