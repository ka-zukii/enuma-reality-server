// src/npc/util.ts

/** Angka semu stabil per index (sama dengan web/src/components/city/life/shared.tsx). */
export function rnd(i: number, salt = 0): number {
  const x = Math.sin((i + 1) * 127.1 + salt * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/** Selisih sudut terpendek dari `from` ke `to`. */
export function angleDiff(from: number, to: number): number {
  const d = ((to - from + Math.PI) % (Math.PI * 2)) - Math.PI;
  return d < -Math.PI ? d + Math.PI * 2 : d;
}

/** Putar `current` mendekati `target` dengan faktor `k` per langkah. */
export function turnToward(current: number, target: number, k: number): number {
  return current + angleDiff(current, target) * k;
}

export const round3 = (v: number): number => Math.round(v * 1000) / 1000;
