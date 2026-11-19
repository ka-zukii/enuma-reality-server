# Enuma Reality Project Server

Backend untuk Enuma Reality: server realtime (Socket.IO) dan REST API (Fastify) untuk dunia 3D multipemain. Pemain bisa masuk sebagai **tamu** tanpa login, lalu menghubungkan akun kapan saja untuk fitur tambahan.

## Fitur

- **Tamu tanpa login.** Pemain otomatis mendapat sesi anonim Supabase. Tidak perlu email atau password untuk bermain.
- **Quick join.** Pemain otomatis masuk ke server otomatis yang belum penuh, atau server baru dibuat jika semua penuh.
- **Join dengan kode undangan.** Server manual bisa dimasuki dengan kode, sampai kapasitas maksimal.
- **Server manual.** Akun (bukan tamu) bisa membuat server dengan nama sendiri dan menjadi OWNER.
- **Realtime.** Posisi pemain disiarkan 20 kali per detik per room, termasuk status dan karakter.
- **Chat.** Tiga kanal: `GLOBAL` (disimpan), `PROXIMITY` (sementara, berdasarkan zona atau jarak), dan `PRIVATE` (DM, disimpan).
- **Interior gedung.** Setiap gedung punya room interior sendiri di dalam server.
- **Pembersihan otomatis.** Server kosong dihapus setelah masa tenggang.

## Teknologi

| Bagian | Pakai |
|---|---|
| Runtime | Node.js, TypeScript |
| HTTP | Fastify 5 |
| Realtime | Socket.IO 4 |
| Auth | Supabase Auth (JWT, sesi anonim) |
| Database | PostgreSQL via Prisma 6 |

## Persyaratan

- Node.js 20 atau lebih baru
- PostgreSQL (disarankan Supabase)
- Proyek Supabase dengan **Anonymous Sign-In** diaktifkan (Authentication → Sign In / Providers → Anonymous)

## Instalasi

```bash
npm install
cp .env.example .env   # isi nilainya, lalu lihat bagian Environment
npx prisma migrate deploy
npx prisma generate
npm run dev
```

Server berjalan di `http://localhost:4000` (atau `PORT` yang diatur). Cek kesehatan server di `GET /health`.

## Environment

Buat file `.env` di root project. Jangan pernah meng-commit file ini.

| Variabel | Wajib | Keterangan |
|---|---|---|
| `SUPABASE_URL` | Ya | URL proyek Supabase |
| `SUPABASE_SECRET_KEY` | Ya | Service role / secret key. Hanya untuk backend |
| `DATABASE_URL` | Ya | Koneksi PostgreSQL (mode pooling) |
| `DIRECT_URL` | Ya | Koneksi PostgreSQL langsung, dipakai untuk migrasi |
| `PORT` | Tidak | Default `4000` |
| `SERVER_AUTO_JOIN_CAP` | Tidak | Batas pemain server otomatis untuk quick join. Default `10` |
| `SERVER_HARD_CAP` | Tidak | Batas maksimal pemain per server. Default `15` |
| `WORKSPACE_CLEANUP_GRACE_SECONDS` | Tidak | Masa tenggang sebelum server kosong dihapus. Default `120` |

Frontend tidak boleh memakai `SUPABASE_SECRET_KEY`. Frontend cukup memakai URL dan anon key.

## Skrip

| Perintah | Fungsi |
|---|---|
| `npm run dev` | Jalankan dengan auto-reload (tsx) |
| `npm run build` | Compile TypeScript ke `dist/` |
| `npm start` | Jalankan hasil build |

## Struktur folder

```
src/
├── server.ts              # Entry point: Fastify, Socket.IO, cron cleanup
├── env.ts                 # Muat .env (harus pertama)
├── config/
│   ├── clients.ts         # Supabase admin client dan Prisma client
│   ├── settings.ts        # Kapasitas dan TTL
│   ├── layouts.ts         # Layout Main Floor dan interior
│   └── buildings.ts       # Daftar gedung yang valid
├── lib/
│   └── auth.ts            # verifyAccessToken, isGuest
├── routes/
│   └── workspace.ts       # Seluruh REST endpoint di /api
├── services/
│   ├── profile.ts         # ensureProfile: sinkronisasi profil dari metadata
│   ├── serverAllocator.ts # Quick join, kapasitas, reservasi kursi
│   ├── workspaces.ts      # Pembuatan server manual dan otomatis
│   └── workspaceCleanup.ts
├── sockets/
│   ├── index.ts           # Auth socket dan wiring event
│   ├── guard.ts           # Pembungkus handler dengan penangkap error
│   ├── tick.ts            # Game loop 20 Hz
│   └── handlers/          # roomJoin, player, chat
├── state/
│   └── presence.ts        # Pemain online (in-memory) dan nama channel
└── types/
    └── fastify.d.ts       # Tipe tambahan untuk FastifyRequest
prisma/
├── schema.prisma
└── migrations/
```

## Autentikasi dan tamu

Setiap request REST dan koneksi socket wajib membawa access token Supabase.

- REST: header `Authorization: Bearer <token>`
- Socket: `auth: { token }` pada handshake

Token diverifikasi lewat `supabaseAdmin.auth.getUser()`. Saat pertama kali dipakai, `ensureProfile` membuat profil dari data user. Profil tamu tidak punya email, jadi diberi placeholder `guest-<id>@anon.local`.

Tamu diidentifikasi dengan `is_anonymous = true`. Saat ini hanya satu aturan yang membatasi tamu: **membuat server manual** (`POST /api/workspaces`) mengembalikan `403` dengan `code: "GUEST_NOT_ALLOWED"`.

Saat tamu menghubungkan email atau Google, user ID tetap sama, sehingga profil, keanggotaan, dan riwayat chat ikut terbawa.

### Konfirmasi email

Konfirmasi email di Supabase **dinonaktifkan** untuk menghindari rate limit saat pendaftaran. Akibatnya:

- Pendaftaran dengan email langsung aktif tanpa verifikasi.
- Email belum terbukti dimiliki pendaftar. Siapa pun bisa mendaftar memakai email orang lain.
- Jika pengaturan **Secure email change** aktif, perubahan email tetap memerlukan konfirmasi dari email lama dan baru.

Rekomendasi:

- Pasang custom SMTP (misalnya Resend atau Brevo) di Authentication → Emails → SMTP Settings, untuk email reset password dan magic link.
- Aktifkan CAPTCHA (Cloudflare Turnstile atau hCaptcha) di Authentication → Attack Protection, supaya sign-in anonim dan pendaftaran tidak bisa dibuat massal. Frontend perlu mengirim captcha token saat `signInAnonymously()` dan `signUp()`.

## Ringkasan API

Dokumentasi lengkap (request, response, dan error) ada di API contract. Ringkasannya:

### REST (prefix `/api`, perlu token)

| Method | Path | Keterangan |
|---|---|---|
| GET | `/workspaces` | Daftar server |
| POST | `/workspaces` | Buat server manual (bukan tamu) |
| DELETE | `/workspaces/:workspaceId` | Hapus server (OWNER) |
| POST | `/workspaces/join` | Gabung dengan kode undangan |
| POST | `/servers/quick-join` | Quick join |
| GET | `/rooms/:roomId/messages` | Riwayat chat global |
| GET | `/workspaces/:workspaceId/dms` | Riwayat DM |
| POST | `/workspaces/:workspaceId/interiors/:buildingKey` | Ambil atau buat interior gedung |

### Socket.IO

Client mengirim: `room:join`, `player:move`, `player:status`, `chat:send`.

Server mengirim: `room:state`, `player:joined`, `player:left`, `room:tick`, `player:status`, `chat:receive`, `server:full`, `error:message`.

Alur dasar: connect dengan token → `GET /api/workspaces` → pilih room → `room:join` → tunggu `room:state` → mulai kirim `player:move` dan `chat:send`.

## Kapasitas

- **Server otomatis:** pemain masuk sampai `SERVER_AUTO_JOIN_CAP` (10). Quick join memilih server yang paling ramai tapi belum penuh.
- **Server manual dan join dengan kode:** sampai `SERVER_HARD_CAP` (15).
- **Kursi cadangan:** quick join mencadangkan kursi selama 15 detik sebelum pemain benar-benar masuk.

Pemeriksaan kapasitas dilakukan tanpa `await` di antara cek dan penyimpanan status pemain, agar dua pemain yang masuk bersamaan tidak lolos bersamaan.

## Catatan dan batasan saat ini

- Kursi cadangan 5 slot untuk teman belum diimplementasikan.
- `GET /rooms/:roomId/messages` belum memeriksa keanggotaan server. Sebaiknya ditambahkan.
- Perubahan nama atau karakter belum disiarkan ke pemain lain secara realtime.
- Posisi pemain dan status hanya ada di memori. Restart server menghapus sesi online, tetapi data di database tetap ada.
- Bentuk pesan dari REST dan socket belum sama. Frontend perlu menormalisasi data.
- Data tamu tidak digabung ke akun. Jika tamu login ke akun yang sudah ada, riwayat chat dan DM yang dibuat saat masih tamu tidak ikut pindah.

## Lisensi

ISC. Lihat `package.json`.
