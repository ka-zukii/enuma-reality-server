import type { MemberRole, WorkspaceMember } from "@prisma/client";
import { prisma } from "../config/clients.js";

/**
 * Peran dasar untuk pemain di sebuah server:
 * - Tamu (sesi anonim)      -> GUEST, ditampilkan sebagai "Tamu"
 * - Akun yang sudah login   -> MEMBER, ditampilkan sebagai "Warga"
 */
export function baseRoleFor(guest: boolean): MemberRole {
  return guest ? "GUEST" : "MEMBER";
}

/**
 * Ambil atau buat keanggotaan user di workspace, lalu sinkronkan peran GUEST/MEMBER
 * dengan status login-nya. Peran OWNER dan ADMIN tidak pernah diubah di sini.
 */
export async function ensureMembership(
  workspaceId: string,
  profileId: string,
  guest: boolean,
): Promise<WorkspaceMember> {
  const desired = baseRoleFor(guest);
  const key = { workspaceId_profileId: { workspaceId, profileId } };

  const membership = await prisma.workspaceMember.upsert({
    where: key,
    update: {},
    create: { workspaceId, profileId, role: desired },
  });

  const isBaseRole =
    membership.role === "MEMBER" || membership.role === "GUEST";
  if (isBaseRole && membership.role !== desired) {
    return prisma.workspaceMember.update({
      where: key,
      data: { role: desired },
    });
  }
  return membership;
}
