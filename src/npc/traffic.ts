// src/npc/traffic.ts
// Lalu lintas kota: lampu 18 detik dan mobil yang berhenti di belakang zebra cross.
import { LANES, laneLength, sampleLane } from "./geometry.js";
import { PassiveNpc, type Npc, type Signal, type StepContext } from "./base.js";

interface CarSpec {
  lane: "outer" | "inner";
  speed: number;
  offset: number;
}

const CARS: CarSpec[] = [
  { lane: "outer", speed: 4.2, offset: 0.05 },
  { lane: "outer", speed: 3.8, offset: 0.3 },
  { lane: "outer", speed: 4.0, offset: 0.56 },
  { lane: "outer", speed: 3.9, offset: 0.82 },
  { lane: "inner", speed: 4.1, offset: 0.12 },
  { lane: "inner", speed: 3.7, offset: 0.46 },
  { lane: "inner", speed: 4.0, offset: 0.78 },
];

const SAFE_FOLLOW_DIST = 10.0;

/** Siklus 18 detik: 0-9 hijau, 9-11 kuning, 11-18 merah. */
export function getTrafficSignal(sec: number): Signal {
  const m = sec % 18;
  if (m < 9) return "green";
  if (m < 11) return "yellow";
  return "red";
}

export function createTraffic(): { cars: Npc[]; update: (ctx: StepContext) => void } {
  const cars = CARS.map((_, i) => new PassiveNpc(`car-${i}`));
  const dists = CARS.map((c) => c.offset * laneLength(LANES[c.lane]));

  const update = (ctx: StepContext): void => {
    const dt = Math.min(ctx.dt, 0.05);

    for (let i = 0; i < CARS.length; i++) {
      const c = CARS[i];
      const lane = LANES[c.lane];
      const total = laneLength(lane);
      const cur = dists[i];
      const curSample = sampleLane(lane, cur);
      const curTx = curSample.tx * lane.dir;

      let blocked = false;
      for (let j = 0; j < CARS.length; j++) {
        if (i === j || CARS[j].lane !== c.lane) continue;
        const other = dists[j];
        const forwardDist =
          lane.dir > 0 ? (other - cur + total) % total : (cur - other + total) % total;
        if (forwardDist > 0 && forwardDist < SAFE_FOLLOW_DIST) {
          blocked = true;
          break;
        }
      }

      if (!blocked && ctx.signal !== "green" && Math.abs(curTx) > 0.7) {
        if (curTx > 0 && curSample.x >= -5.5 && curSample.x <= -2.6) blocked = true;
        else if (curTx < 0 && curSample.x <= 5.5 && curSample.x >= 2.6) blocked = true;
      }

      if (!blocked) {
        dists[i] = (((cur + lane.dir * c.speed * dt) % total) + total) % total;
      }

      const s = sampleLane(lane, dists[i]);
      const tx = s.tx * lane.dir;
      const tz = s.tz * lane.dir;
      const npc = cars[i];
      npc.x = s.x;
      npc.z = s.z;
      npc.yaw = Math.atan2(-tx, -tz);
      npc.anim = 1;
    }
  };

  return { cars, update };
}
