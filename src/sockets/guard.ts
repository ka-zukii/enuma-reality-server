import type { Socket } from "socket.io";

/**
 * Daftarkan handler event dengan penangkap error.
 * Error async yang tidak ditangkap akan menjatuhkan proses Node, jadi semua
 * handler event wajib lewat sini.
 */
export function onEvent<P>(
  socket: Socket,
  event: string,
  handler: (payload: P) => unknown,
): void {
  socket.on(event, async (payload: P) => {
    try {
      await handler(payload);
    } catch (err) {
      console.error(`[Socket:${event}] socket=${socket.id}`, err);
      socket.emit("error:message", "Terjadi kesalahan pada server.");
    }
  });
}
