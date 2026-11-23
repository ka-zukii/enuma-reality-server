// src/services/tram.ts
// Simulasi trem di server. Satu trem per room, sehingga semua pemain di room
// yang sama melihat trem di posisi yang sama.
import { LOOP_LENGTH, STATION_STOPS } from "../config/railway.js";

export const TRAM = {
  carCount: 2,
  carLength: 10.3,
  carGap: 0.3,
  speed: 7,
  accel: 1.5,
} as const;

const CAR_SPACING = TRAM.carLength + TRAM.carGap;
/** Jarak titik berhenti kepala dari pusat stasiun */
const STOP_OFFSET = ((TRAM.carCount - 1) * CAR_SPACING) / 2;
const STOP_EPS = 0.05;

/** Status trem yang dikirim ke client. */
export interface TramSnapshot {
  /** Jarak tempuh kepala trem (tidak dibungkus) */
  head: number;
  /** Kecepatan saat ini (m/s) */
  v: number;
  /** Sisa waktu berhenti di stasiun (detik), 0 = sedang jalan */
  dwell: number;
  /** Waktu server (ms) saat state ini dihitung. Dipakai client untuk interpolasi. */
  t: number;
}

/** Langkah simulasi tetap. Hasilnya tidak bergantung pada jitter tick. */
const SIM_STEP = 1 / 60;
/** Jika server tersendat lebih dari ini, jangan mengejar penuh (hindari lompatan besar). */
const MAX_CATCH_UP_MS = 500;

const trams = new Map<string, TramSnapshot>();

export function getTram(roomId: string): TramSnapshot {
  let tram = trams.get(roomId);
  if (!tram) {
    tram = { head: 0, v: 0, dwell: 0, t: Date.now() };
    trams.set(roomId, tram);
  }
  return tram;
}

/** Hapus trem dari room yang sudah kosong. */
export function pruneTrams(activeRoomIds: Set<string>): void {
  for (const roomId of trams.keys()) {
    if (!activeRoomIds.has(roomId)) trams.delete(roomId);
  }
}

export function snapshotTram(tram: TramSnapshot): TramSnapshot {
  return { head: tram.head, v: tram.v, dwell: tram.dwell, t: tram.t };
}

/**
 * Majukan simulasi sampai waktu `nowMs` memakai langkah tetap (1/60 s).
 * Dipanggil setiap tick, sehingga state selalu sesuai waktu nyata.
 */
export function advanceTram(tram: TramSnapshot, nowMs: number): void {
  if (nowMs - tram.t > MAX_CATCH_UP_MS) tram.t = nowMs - MAX_CATCH_UP_MS;
  while (tram.t < nowMs) {
    const dt = Math.min(SIM_STEP, (nowMs - tram.t) / 1000);
    stepTram(tram, dt);
    tram.t = Math.min(nowMs, tram.t + dt * 1000);
  }
}

/** Jarak dari kepala trem ke stasiun berikutnya di depan, beserta lama berhentinya. */
function distToNextStop(head: number): { dist: number; dwell: number } {
  let dist = Infinity;
  let dwell = 0;
  for (const st of STATION_STOPS) {
    let d = (st.s + STOP_OFFSET - head) % LOOP_LENGTH;
    if (d < 0) d += LOOP_LENGTH;
    // Titik berhenti yang baru ditinggalkan dianggap satu putaran penuh
    if (d < 1e-4) d = LOOP_LENGTH;
    if (d < dist) {
      dist = d;
      dwell = st.dwell;
    }
  }
  return { dist, dwell };
}

/**
 * Maju satu langkah dengan profil kecepatan halus:
 * berangkat dari diam, mengerem tepat di stasiun, berhenti selama dwell,
 * lalu berangkat lagi.
 */
export function stepTram(tram: TramSnapshot, dt: number): void {
  if (tram.dwell > 0) {
    tram.dwell = Math.max(0, tram.dwell - dt);
    tram.v = 0;
    return;
  }

  const { dist, dwell } = distToNextStop(tram.head);
  const vTarget = Math.min(TRAM.speed, Math.sqrt(2 * TRAM.accel * dist));

  if (tram.v < vTarget) {
    tram.v = Math.min(vTarget, tram.v + TRAM.accel * dt);
  } else {
    tram.v = Math.max(vTarget, tram.v - TRAM.accel * dt);
  }

  const step = tram.v * dt;
  if (step >= dist || (dist - step < STOP_EPS && tram.v < 1)) {
    tram.head += dist;
    tram.v = 0;
    tram.dwell = dwell;
  } else {
    tram.head += step;
  }
}
