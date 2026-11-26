import type { MemberRole } from "@prisma/client";
import { prisma } from "../config/clients.js";

/**
 * Role membership:
 * - User yang sudah login  -> MEMBER (ditampilkan sebagai "Warga")
 * - Tamu (sign-in anonim)  -> GUEST  (ditampilkan sebagai "Tamu")
 *
 * OWNER dan ADMIN tidak pernah diubah di sini. Tamu yang kemudian login
 * (hubungkan email/Google) otomatis naik dari GUEST menjadi MEMBER.
 */
export async function ensureMembership(
  workspaceId: string,
  profileId: string,
  guest: boolean,
) {
  const membership = await prisma.workspaceMember.upsert({
    where: { workspaceId_profileId: { workspaceId, profileId } },
    update: {},
    create: {
      workspaceId,
      profileId,
      role: guest ? "GUEST" : "MEMBER",
    },
  });

  if (!guest && membership.role === "GUEST") {
    return prisma.workspaceMember.update({
      where: { id: membership.id },
      data: { role: "MEMBER" satisfies MemberRole },
    });
  }

  return membership;
}
