import type { User } from "@supabase/supabase-js";
import { supabaseAdmin } from "../config/clients.js";

/** Verifikasi access token Supabase. Mengembalikan null jika token tidak valid. */
export async function verifyAccessToken(token: string): Promise<User | null> {
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error) {
    // Bedakan token bermasalah dari gangguan koneksi ke Supabase
    console.warn("[auth] getUser gagal:", error.status, error.message);
    return null;
  }
  return data.user ?? null;
}

/** Tamu = sesi anonim (belum dihubungkan ke email atau Google). */
export function isGuest(user: User): boolean {
  return (user as { is_anonymous?: boolean }).is_anonymous === true;
}
