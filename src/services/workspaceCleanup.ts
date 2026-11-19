import { prisma } from "../config/clients.js";
import { WORKSPACE_GRACE_MS } from "../config/settings.js";
import { countOnlinePlayersInWorkspace } from "../state/presence.js";

// Timer penghapusan aktif untuk setiap workspaceId
const cleanupTimers = new Map<string, NodeJS.Timeout>();

/** Batalkan jadwal hapus jika ada pemain yang masuk ke workspace */
export function cancelWorkspaceCleanup(workspaceId: string): void {
  const timer = cleanupTimers.get(workspaceId);
  if (!timer) return;

  clearTimeout(timer);
  cleanupTimers.delete(workspaceId);
  console.log(
    `[WorkspaceCleanup] Pembatalan auto-delete untuk workspace: ${workspaceId} (ada pemain masuk)`,
  );
}

/** Jadwalkan penghapusan workspace jika sudah 0 pemain online */
export function scheduleWorkspaceCleanup(
  workspaceId: string,
  delayMs: number = WORKSPACE_GRACE_MS,
): void {
  if (cleanupTimers.has(workspaceId)) return;
  if (countOnlinePlayersInWorkspace(workspaceId) > 0) return;

  console.log(
    `[WorkspaceCleanup] Workspace ${workspaceId} kosong. Dijadwalkan dihapus dalam ${delayMs / 1000} detik.`,
  );

  const timer = setTimeout(async () => {
    cleanupTimers.delete(workspaceId);

    // Cek ulang sebelum benar-benar menghapus
    if (countOnlinePlayersInWorkspace(workspaceId) > 0) {
      console.log(
        `[WorkspaceCleanup] Batal menghapus workspace ${workspaceId}: pemain kembali online.`,
      );
      return;
    }

    try {
      const workspace = await prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: { id: true, name: true },
      });
      if (!workspace) return;

      await prisma.workspace.delete({ where: { id: workspaceId } });
      console.log(
        `🗑️ [WorkspaceCleanup] Workspace otomatis dihapus karena kosong: "${workspace.name}" (${workspace.id})`,
      );
    } catch (err) {
      console.error(
        `[WorkspaceCleanup] Gagal menghapus workspace ${workspaceId}:`,
        err,
      );
    }
  }, delayMs);

  cleanupTimers.set(workspaceId, timer);
}

/** Sapu workspace yang kosong dan sudah melewati batas waktu (misal sisa restart server) */
export async function sweepEmptyWorkspaces(
  olderThanMs: number = WORKSPACE_GRACE_MS,
): Promise<void> {
  try {
    const cutoffDate = new Date(Date.now() - olderThanMs);

    const inactiveWorkspaces = await prisma.workspace.findMany({
      where: { updatedAt: { lte: cutoffDate } },
      select: { id: true, name: true },
    });

    for (const ws of inactiveWorkspaces) {
      if (countOnlinePlayersInWorkspace(ws.id) > 0) continue;
      if (cleanupTimers.has(ws.id)) continue;

      try {
        await prisma.workspace.delete({ where: { id: ws.id } });
        console.log(
          `🗑️ [WorkspaceSweep] Membersihkan workspace kosong terbengkalai: "${ws.name}" (${ws.id})`,
        );
      } catch (delErr) {
        console.error(
          `[WorkspaceSweep] Gagal menghapus workspace ${ws.id}:`,
          delErr,
        );
      }
    }
  } catch (err) {
    console.error("[WorkspaceSweep] Error saat menjalankan sweep:", err);
  }
}

/** Mulai background job pembersihan workspace kosong secara berkala */
export function startWorkspaceCleanupCron(intervalMs: number = 60 * 1000): void {
  setTimeout(() => {
    sweepEmptyWorkspaces();
  }, 5000);

  setInterval(() => {
    sweepEmptyWorkspaces();
  }, intervalMs);

  console.log(
    `🧹 [WorkspaceCleanup] Background auto-cleanup aktif (Grace period: ${WORKSPACE_GRACE_MS / 1000}s, Interval: ${intervalMs / 1000}s)`,
  );
}
