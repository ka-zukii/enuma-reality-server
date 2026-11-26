// src/npc/cyclists.ts
import { laneLength, sampleLane, type LaneSpec } from "./geometry.js";
import { PassiveNpc, type Npc, type StepContext } from "./base.js";

const CYCLIST_LANE: LaneSpec = { minX: -36.8, maxX: 36.8, minZ: -24.0, maxZ: 15.6, r: 3.0, dir: 1 };

export function createCyclists(): { cyclists: Npc[]; update: (ctx: StepContext) => void } {
  const cyclists = [0, 1].map((i) => new PassiveNpc(`cyclist-${i}`));
  const total = laneLength(CYCLIST_LANE);
  const offsets = [0, 0.5];

  const update = (ctx: StepContext): void => {
    offsets.forEach((offset, i) => {
      const dist = ctx.nowSec * 3.4 + offset * total;
      const s = sampleLane(CYCLIST_LANE, dist);
      const n = cyclists[i];
      n.x = s.x;
      n.z = s.z;
      n.yaw = Math.atan2(s.tx, s.tz);
      n.anim = 1;
    });
  };

  return { cyclists, update };
}
