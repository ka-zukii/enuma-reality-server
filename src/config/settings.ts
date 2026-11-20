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

// Deteksi pemain tidak aktif
// Pemain yang tidak mengirim aktivitas selama ini akan dikeluarkan dari server
export const INACTIVITY_TIMEOUT_MS =
  (Number(process.env.PLAYER_INACTIVITY_SECONDS) || 180) * 1000;

// Seberapa sering server memeriksa pemain tidak aktif
export const INACTIVITY_SWEEP_MS = 15_000;

// Grace period saat koneksi putus: avatar ditahan selama ini sebelum dihapus
export const DISCONNECT_GRACE_MS =
  (Number(process.env.DISCONNECT_GRACE_SECONDS) || 15) * 1000;
