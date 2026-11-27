// src/npc/social.ts
// NPC yang duduk/menunggu (menyapa saat pemain datang) dan Maya yang berkeliling taman.
import { Npc, nearest, type StepContext } from "./base.js";
import { turnToward } from "./util.js";

interface ChatterSpec {
  id: string;
  pos: [number, number];
  rotY: number;
  sitting: boolean;
  lineCount: number;
}

const CHATTERS: ChatterSpec[] = [
  {
    id: "rina",
    pos: [34.72, 12.2],
    rotY: Math.PI / 2,
    sitting: true,
    lineCount: 2,
  },
  {
    id: "budi",
    pos: [36.28, 12.2],
    rotY: -Math.PI / 2,
    sitting: true,
    lineCount: 2,
  },
  { id: "siti", pos: [-16, 28.5], rotY: 0, sitting: true, lineCount: 2 },
  { id: "dito", pos: [14, 13.4], rotY: Math.PI, sitting: true, lineCount: 2 },
  { id: "andi", pos: [-22.6, 17.1], rotY: 0, sitting: false, lineCount: 2 },
];

class Chatter extends Npc {
  constructor(private readonly spec: ChatterSpec) {
    super(spec.id);
    this.x = spec.pos[0];
    this.z = spec.pos[1];
    this.yaw = spec.rotY;
    this.anim = spec.sitting ? 2 : 0;
  }

  click(now: number): void {
    const next = this.talk < 0 ? 0 : (this.talk + 1) % this.spec.lineCount;
    this.say(next, now, 3000);
  }

  update(ctx: StepContext): void {
    const p = nearest(ctx.players, this.x, this.z);
    const isNear = !!p && p.dist < 2.8;
    this.greetOnApproach(isNear, 0, ctx.nowMs, 3000);

    if (!this.spec.sitting) {
      const target =
        this.isTalking() && p ? Math.atan2(p.dx, p.dz) : this.spec.rotY;
      this.yaw = turnToward(this.yaw, target, 0.12);
    }
  }
}

export function createSocial(): {
  npcs: Npc[];
  update: (ctx: StepContext) => void;
} {
  const chatters = CHATTERS.map((c) => new Chatter(c));
  const maya = new Maya();
  const npcs: Npc[] = [...chatters, maya];
  return {
    npcs,
    update: (ctx) => {
      for (const c of chatters) c.update(ctx);
      maya.update(ctx);
    },
  };
}

/** Maya: berjalan memutari kolam air mancur, berhenti saat ada pemain di dekatnya. */
class Maya extends Npc {
  private angle = 0;
  private static readonly LINES = 2;

  constructor() {
    super("maya");
    this.x = -12.5;
    this.z = 32.5;
  }

  click(now: number): void {
    const next = this.talk < 0 ? 0 : (this.talk + 1) % Maya.LINES;
    this.say(next, now, 3000);
  }

  update(ctx: StepContext): void {
    const px = -16 + Math.cos(this.angle) * 3.5;
    const pz = 32.5 + Math.sin(this.angle) * 3.5;
    const p = nearest(ctx.players, px, pz);
    const isNear = !!p && p.dist < 2.5;
    this.greetOnApproach(isNear, 0, ctx.nowMs, 3000);

    if (this.isTalking()) {
      this.x = px;
      this.z = pz;
      this.y = Math.sin(ctx.nowSec * 2) * 0.005;
      if (p) this.yaw = Math.atan2(p.dx, p.dz);
      this.anim = 0;
      return;
    }

    this.angle += ctx.dt * 0.35;
    this.x = -16 + Math.cos(this.angle) * 3.5;
    this.z = 32.5 + Math.sin(this.angle) * 3.5;
    this.y = 0;
    this.yaw = Math.atan2(-Math.sin(this.angle), Math.cos(this.angle));
    this.anim = 1;
  }
}
