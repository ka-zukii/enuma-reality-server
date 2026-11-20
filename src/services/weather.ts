const BMKG_URL = "https://api.bmkg.go.id/publik/prakiraan-cuaca";
const REFRESH_MS = 6 * 60 * 60 * 1000; // data BMKG diperbarui 2x sehari

export interface WeatherCache {
  data: unknown;
  fetchedAt: number;
}

let cache: WeatherCache | null = null;
let inflight: Promise<WeatherCache> | null = null;

function getAdm4(): string {
  const adm4 = process.env.BMKG_ADM4;
  if (!adm4) throw new Error("BMKG_ADM4 belum diisi di .env");
  return adm4;
}

async function fetchFromBmkg(): Promise<WeatherCache> {
  const url = `${BMKG_URL}?adm4=${encodeURIComponent(getAdm4())}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`BMKG responded ${res.status}`);

  return { data: await res.json(), fetchedAt: Date.now() };
}

/**
 * Ambil data terbaru dari BMKG dan simpan ke cache.
 * Jika request sedang berjalan, request tersebut yang dipakai ulang.
 * Jika gagal, cache lama tetap dipertahankan.
 */
export function refreshWeather(): Promise<WeatherCache> {
  if (inflight) return inflight;

  inflight = fetchFromBmkg()
    .then((result) => {
      cache = result;
      return result;
    })
    .finally(() => {
      inflight = null;
    });

  return inflight;
}

/** Untuk endpoint: kembalikan cache. Jika belum pernah berhasil, ambil dulu dari BMKG. */
export async function getWeather(): Promise<WeatherCache> {
  if (cache) return cache;
  return refreshWeather();
}

/** Jalankan pembaruan saat server start, lalu berkala setiap 6 jam */
export function startWeatherRefresh(): void {
  refreshWeather().catch((err) =>
    console.error("[Weather] Gagal memperbarui data awal:", err),
  );

  setInterval(() => {
    refreshWeather().catch((err) =>
      console.error(
        "[Weather] Gagal memperbarui data, cache lama dipakai:",
        err,
      ),
    );
  }, REFRESH_MS);
}
