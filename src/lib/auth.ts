import type { User } from "@supabase/supabase-js";
import { supabaseAdmin } from "../config/clients.js";

/** Verifikasi access token Supabase. Mengembalikan null jika token tidak valid. */
export async function verifyAccessToken(token: string): Promise<User | null> {
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user;
}

/** Tamu = sesi anonim (belum dihubungkan ke email atau Google). */
export function isGuest(user: User): boolean {
  return (user as { is_anonymous?: boolean }).is_anonymous === true;
}
