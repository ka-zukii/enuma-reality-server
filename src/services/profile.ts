import { Prisma } from "@prisma/client";
import type { User } from "@supabase/supabase-js";
import { prisma } from "../config/clients.js";

type AvatarConfig = {
  color: string;
  style: string;
  character: string;
};

const DEFAULT_CHARACTER = "karakter_1";
const DEFAULT_AVATAR: AvatarConfig = {
  color: "#00e5ff",
  style: "default",
  character: DEFAULT_CHARACTER,
};

/** Baca avatarConfig dari database dan isi bagian yang hilang dengan default */
function readAvatar(raw: Prisma.JsonValue | null): AvatarConfig {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const obj = raw as Record<string, unknown>;
    return {
      color: typeof obj.color === "string" ? obj.color : DEFAULT_AVATAR.color,
      style: typeof obj.style === "string" ? obj.style : DEFAULT_AVATAR.style,
      character:
        typeof obj.character === "string"
          ? obj.character
          : DEFAULT_CHARACTER,
    };
  }
  return { ...DEFAULT_AVATAR };
}

function isUniqueViolation(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002"
  );
}

/**
 * Ambil profil user; buat jika belum ada, dan sinkronkan nama, email, serta
 * karakter dari user metadata. Berlaku untuk tamu (anonim) maupun akun biasa.
 */
export async function ensureProfile(user: User) {
  const meta = user.user_metadata ?? {};
  const metaName = (meta.full_name as string | undefined)?.trim() || undefined;
  const metaCharacter = (meta.character as string | undefined) || undefined;

  const existing = await prisma.profile.findUnique({ where: { id: user.id } });

  // Profil baru
  if (!existing) {
    const avatar: AvatarConfig = {
      ...DEFAULT_AVATAR,
      character: metaCharacter ?? DEFAULT_CHARACTER,
    };

    try {
      return await prisma.profile.create({
        data: {
          id: user.id,
          // Tamu anonim tidak punya email; pakai placeholder yang unik per user
          email: user.email ?? `guest-${user.id}@anon.local`,
          fullName: metaName ?? `Tamu-${user.id.slice(0, 6)}`,
          avatarConfig: avatar,
        },
      });
    } catch (err) {
      // Dua request bersamaan bisa lolos cek di atas; ambil yang sudah terbuat
      const again = await prisma.profile.findUnique({ where: { id: user.id } });
      if (again) return again;
      throw err;
    }
  }

  // Profil sudah ada: hitung nilai baru
  const currentAvatar = readAvatar(existing.avatarConfig);
  const nextAvatar: AvatarConfig = metaCharacter
    ? { ...currentAvatar, character: metaCharacter }
    : currentAvatar;

  const nextName = metaName ?? existing.fullName;
  const nextEmail = user.email ?? existing.email;

  const changed =
    nextName !== existing.fullName ||
    nextEmail !== existing.email ||
    JSON.stringify(nextAvatar) !== JSON.stringify(currentAvatar);

  if (!changed) return existing;

  try {
    return await prisma.profile.update({
      where: { id: user.id },
      data: { fullName: nextName, email: nextEmail, avatarConfig: nextAvatar },
    });
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;

    // Email sudah dipakai profil lain: simpan nama dan karakter saja
    return prisma.profile.update({
      where: { id: user.id },
      data: { fullName: nextName, avatarConfig: nextAvatar },
    });
  }
}
