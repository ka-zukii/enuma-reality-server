// src/npc/geometry.ts
// Geometri yang dipakai simulasi NPC di server. Salinan dari web/src/components/city/life/lanes.ts
// dan web/src/lib/tramRuntime.ts (bagian gerbong). Jika bentuk jalan berubah, ubah keduanya.
import { CENTER_PATH, LOOP_LENGTH } from "../config/railway.js";
import { TRAM } from "../services/tram.js";

export interface LaneSpec {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  r: number;
  dir: 1 | -1;
}

export const LANES: Record<"outer" | "inner", LaneSpec> = {
  outer: { minX: -45.75, maxX: 45.75, minZ: -31.75, maxZ: 23.75, r: 7.75, dir: 1 },
  inner: { minX: -42.25, maxX: 42.25, minZ: -28.25, maxZ: 20.25, r: 5.25, dir: -1 },
};

export function laneLength(l: LaneSpec): number {
  const straightX = Math.max(0, l.maxX - l.minX - 2 * l.r);
  const straightZ = Math.max(0, l.maxZ - l.minZ - 2 * l.r);
  return 2 * (straightX + straightZ) + 2 * Math.PI * l.r;
}

/** Posisi dan arah pada lintasan persegi-lengkung tertutup. */
export function sampleLane(
  l: LaneSpec,
  dist: number,
): { x: number; z: number; tx: number; tz: number } {
  const sx = Math.max(0, l.maxX - l.minX - 2 * l.r);
  const sz = Math.max(0, l.maxZ - l.minZ - 2 * l.r);
  const arc = (Math.PI / 2) * l.r;
  const total = 2 * (sx + sz) + 4 * arc;
  let d = ((dist % total) + total) % total;

  if (d < sx) return { x: l.minX + l.r + d, z: l.minZ, tx: 1, tz: 0 };
  d -= sx;
  if (d < arc) {
    const a = -Math.PI / 2 + (d / arc) * (Math.PI / 2);
    return {
      x: l.maxX - l.r + Math.cos(a) * l.r,
      z: l.minZ + l.r + Math.sin(a) * l.r,
      tx: -Math.sin(a),
      tz: Math.cos(a),
    };
  }
  d -= arc;
  if (d < sz) return { x: l.maxX, z: l.minZ + l.r + d, tx: 0, tz: 1 };
  d -= sz;
  if (d < arc) {
    const a = (d / arc) * (Math.PI / 2);
    return {
      x: l.maxX - l.r + Math.cos(a) * l.r,
      z: l.maxZ - l.r + Math.sin(a) * l.r,
      tx: -Math.sin(a),
      tz: Math.cos(a),
    };
  }
  d -= arc;
  if (d < sx) return { x: l.maxX - l.r - d, z: l.maxZ, tx: -1, tz: 0 };
  d -= sx;
  if (d < arc) {
    const a = Math.PI / 2 + (d / arc) * (Math.PI / 2);
    return {
      x: l.minX + l.r + Math.cos(a) * l.r,
      z: l.maxZ - l.r + Math.sin(a) * l.r,
      tx: -Math.sin(a),
      tz: Math.cos(a),
    };
  }
  d -= arc;
  if (d < sz) return { x: l.minX, z: l.maxZ - l.r - d, tx: 0, tz: -1 };
  d -= sz;
  const a = Math.PI + (d / arc) * (Math.PI / 2);
  return {
    x: l.minX + l.r + Math.cos(a) * l.r,
    z: l.minZ + l.r + Math.sin(a) * l.r,
    tx: -Math.sin(a),
    tz: Math.cos(a),
  };
}

/* ---------- Rel & gerbong ---------- */

export function loopPoint(s: number): { x: number; z: number; angle: number } {
  const { points, cum, length } = CENTER_PATH;
  const d = ((s % length) + length) % length;
  let lo = 0;
  let hi = points.length - 2;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (cum[mid] <= d) lo = mid;
    else hi = mid - 1;
  }
  const a = points[lo];
  const b = points[lo + 1];
  const segLen = cum[lo + 1] - cum[lo] || 1;
  const t = (d - cum[lo]) / segLen;
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  return { x: a.x + dx * t, z: a.z + dz * t, angle: Math.atan2(dx, dz) };
}

const CAR_SPACING = TRAM.carLength + TRAM.carGap;
const CAR_HALF = TRAM.carLength / 2;
export const FLOOR_Y = 0.6;

export function carPose(head: number, i: number): { x: number; z: number; angle: number } {
  const center = head - i * CAR_SPACING;
  const front = loopPoint(center + CAR_HALF);
  const back = loopPoint(center - CAR_HALF);
  return {
    x: (front.x + back.x) / 2,
    z: (front.z + back.z) / 2,
    angle: Math.atan2(front.x - back.x, front.z - back.z),
  };
}

/** Posisi dunia penumpang (rx, rz) saat trem berkepala di `head`. */
export function riderWorldPos(head: number, rx: number, rz: number): [number, number] {
  const i = Math.max(0, Math.min(TRAM.carCount - 1, Math.round(-rz / CAR_SPACING)));
  const cp = carPose(head, i);
  const lz = rz + i * CAR_SPACING;
  const a = cp.angle;
  return [
    cp.x + rx * Math.cos(a) + lz * Math.sin(a),
    cp.z - rx * Math.sin(a) + lz * Math.cos(a),
  ];
}

/* ---------- Peron ---------- */

export const PLATFORM = { x: 0, z: 46.6, halfX: 13, halfZ: 1.5, height: 0.6 } as const;

export function platformY(x: number, z: number): number {
  return Math.abs(x - PLATFORM.x) <= PLATFORM.halfX && Math.abs(z - PLATFORM.z) <= PLATFORM.halfZ
    ? PLATFORM.height
    : 0;
}

export { LOOP_LENGTH };
