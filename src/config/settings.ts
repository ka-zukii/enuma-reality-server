import "../env.js";

// Kapasitas server
export const AUTO_JOIN_CAP = Number(process.env.SERVER_AUTO_JOIN_CAP) || 10;
export const HARD_CAP = Number(process.env.SERVER_HARD_CAP) || 15;

// Auto-cleanup workspace kosong
export const WORKSPACE_GRACE_MS =
  (Number(process.env.WORKSPACE_CLEANUP_GRACE_SECONDS) || 120) * 1000;

// Seat reservation untuk quick-join
export const RESERVATION_TTL_MS = 15_000;

// Chat proximity
export const PROXIMITY_CHAT_RADIUS = 6.0; // meter
