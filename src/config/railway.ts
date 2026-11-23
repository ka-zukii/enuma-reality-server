// src/config/railway.ts
// Salinan bagian matematika geometri rel dari web/src/config/railway.ts.
// Server dan client HARUS menghitung jalur yang sama persis, jadi jika mengubah
// RAIL atau bentuk jalur, ubah keduanya.

export const RAIL = {
  halfX: 39.5,
  halfZ: 39.5,
  cornerRadius: 18,
  arcSegments: 24,
} as const;

interface PathPoint {
  x: number;
  z: number;
}

interface TrackPath {
  points: PathPoint[];
  cum: number[];
  length: number;
}

function buildRoundedPath(
  hx: number,
  hz: number,
  r: number,
  steps: number = RAIL.arcSegments,
): TrackPath {
  const cx = hx - r;
  const cz = hz - r;

  const arcs = [
    { x: cx, z: cz, a0: 0 },
    { x: -cx, z: cz, a0: Math.PI / 2 },
    { x: -cx, z: -cz, a0: Math.PI },
    { x: cx, z: -cz, a0: (3 * Math.PI) / 2 },
  ];

  const points: PathPoint[] = [];
  for (const arc of arcs) {
    for (let i = 0; i <= steps; i++) {
      const a = arc.a0 + (Math.PI / 2) * (i / steps);
      points.push({
        x: arc.x + r * Math.cos(a),
        z: arc.z + r * Math.sin(a),
      });
    }
  }
  points.push({ ...points[0] });

  const cum: number[] = [0];
  for (let i = 1; i < points.length; i++) {
    const dx = points[i].x - points[i - 1].x;
    const dz = points[i].z - points[i - 1].z;
    cum.push(cum[i - 1] + Math.hypot(dx, dz));
  }

  return { points, cum, length: cum[cum.length - 1] };
}

const CENTER_PATH = buildRoundedPath(RAIL.halfX, RAIL.halfZ, RAIL.cornerRadius);

/** Keliling loop dalam unit (meter). */
export const LOOP_LENGTH = CENTER_PATH.length;

/** Stasiun. dwell = lama trem berhenti (detik). */
const STATIONS = [{ x: 0, z: 36, dwell: 10 }];

/** Jarak sepanjang jalur pusat untuk titik terdekat dari (x, z). */
function nearestArcLength(x: number, z: number): number {
  const { points, cum } = CENTER_PATH;
  let best = 0;
  let bestDist = Infinity;

  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len2 = dx * dx + dz * dz || 1;

    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / len2));
    const px = a.x + dx * t;
    const pz = a.z + dz * t;
    const d = Math.hypot(x - px, z - pz);

    if (d < bestDist) {
      bestDist = d;
      best = cum[i] + Math.sqrt(len2) * t;
    }
  }

  return best;
}

export const STATION_STOPS = STATIONS.map((st) => ({
  s: nearestArcLength(st.x, st.z),
  dwell: st.dwell,
}));
