## API Contract: Enuma Reality Server (versi guest)

### Ringkasan

- **Base URL REST:** `https://<host>` (REST di bawah prefix `/api`)
- **Socket.IO:** path default `/socket.io`, berada di host yang sama
- **Autentikasi:** semua endpoint `/api/*` dan koneksi socket memakai Supabase access token (`Authorization: Bearer <token>` untuk REST, `auth: { token }` untuk socket). Token bisa berasal dari sesi tamu anonim atau akun yang sudah login.
- **Format:** JSON. Tanggal berupa string ISO 8601.
- **Tamu:** user dengan `is_anonymous = true`. Backend menandai tamu dengan `isGuest`, tetapi hanya fitur `POST /api/workspaces` yang dibatasi.

---

### 1. REST API

#### 1.1 Health (tanpa auth, tanpa prefix `/api`)

`GET /health`

json

```json
200 { "status": "ok", "service": "Enuma Reality Project Server", "timestamp": "2026-11-19T10:00:00.000Z" }
```

#### 1.2 Endpoint `/api`

Semua endpoint di bawah wajib header `Authorization: Bearer <token>`.

| Method | Path                                                  | Fungsi                                                | Sukses | Error              |
| ------ | ----------------------------------------------------- | ----------------------------------------------------- | ------ | ------------------ |
| GET    | `/api/workspaces`                                     | Daftar server manual dan server otomatis yang diikuti | 200    | 401                |
| POST   | `/api/workspaces`                                     | Buat server manual (khusus akun, bukan tamu)          | 201    | 400, 401, 403      |
| POST   | `/api/servers/quick-join`                             | Pilih atau buat server otomatis                       | 200    | 401, 500           |
| DELETE | `/api/workspaces/:workspaceId`                        | Hapus server (khusus OWNER)                           | 200    | 401, 403           |
| POST   | `/api/workspaces/join`                                | Gabung dengan kode undangan                           | 200    | 400, 401, 404, 409 |
| GET    | `/api/rooms/:roomId/messages`                         | Riwayat chat global 50 pesan terakhir                 | 200    | 401                |
| GET    | `/api/workspaces/:workspaceId/dms`                    | Riwayat DM milik user di server tersebut              | 200    | 401                |
| POST   | `/api/workspaces/:workspaceId/interiors/:buildingKey` | Ambil atau buat ruangan interior gedung               | 200    | 401, 404           |

##### `GET /api/workspaces`

Response: array workspace.

ts

```ts
type Workspace = {
  id: string;
  name: string;
  slug: string;
  isAuto: boolean;
  ownerId: string | null;
  inviteCode?: string;        // hanya jika user adalah member
  createdAt: string;
  updatedAt: string;
  rooms: Room[];
  _count: { members: number };
  myRole: "OWNER" | "ADMIN" | "MEMBER" | "GUEST" | null;
  isMember: boolean;
  onlineCount: number;
  maxCapacity: number;        // selalu HARD_CAP (15)
};

type Room = {
  id: string;
  workspaceId: string;
  buildingKey: string | null;
  name: string;
  mapTemplate: string;
  layoutJson: unknown;
  maxCapacity: number;
  createdAt: string;
  updatedAt: string;
};
```

Catatan: server manual tanpa keanggotaan tetap muncul di daftar, tetapi `inviteCode` disembunyikan.

##### `POST /api/workspaces`

Request:

json

```json
{ "name": "Kantor Pusat", "mapTemplate": "modern-office-1" }
```

`mapTemplate` opsional.

Response `201`: objek `Workspace` dengan `rooms` berisi satu room “Main Floor”.

Error:

json

```json
400 { "error": "Nama workspace minimal 3 karakter" }
403 { "error": "Membuat server membutuhkan akun. Hubungkan email atau Google dulu.", "code": "GUEST_NOT_ALLOWED" }
```

##### `POST /api/servers/quick-join`

Tanpa body.

Response `200`:

json

```json
{ "workspace": { "...Workspace" } }
```

Backend memilih server otomatis yang belum mencapai `AUTO_JOIN_CAP` (10 pemain) dan paling ramai, atau membuat server baru. Kursi langsung dicadangkan selama 15 detik. Setelah itu frontend harus segera connect socket dan `room:join`.

##### `DELETE /api/workspaces/:workspaceId`

Response `200`:

json

```json
{ "message": "Workspace berhasil dihapus", "workspaceId": "..." }
```

Error `403`: `{ "error": "Hanya OWNER yang dapat menghapus workspace ini" }`

##### `POST /api/workspaces/join`

Request:

json

```json
{ "inviteCode": "clx..." }
```

Response `200`: objek `Workspace` (dengan `rooms`).

Error:

json

```json
400 { "error": "Kode undangan wajib diisi" }
404 { "error": "Kode undangan tidak ditemukan" }
409 { "error": "Server sudah penuh (maks 15 pemain)" }
```

Pengguna yang berhasil bergabung otomatis menjadi `MEMBER`. Tamu boleh bergabung dengan kode.

##### `GET /api/rooms/:roomId/messages`

Response `200`: array, urut dari yang terlama.

ts

```ts
type RoomMessage = {
  id: string;
  workspaceId: string;
  roomId: string | null;
  senderId: string;
  content: string;
  createdAt: string;
  sender: { id: string; fullName: string; avatarUrl: string | null };
};
```

##### `GET /api/workspaces/:workspaceId/dms`

Response `200`: array, urut dari yang terlama, hanya DM yang melibatkan user.

ts

```ts
type DmItem = {
  id: string;
  channel: "PRIVATE";
  senderId: string;
  senderName: string;
  receiverId: string;
  receiverName: string;
  content: string;
  createdAt: string;
};
```

##### `POST /api/workspaces/:workspaceId/interiors/:buildingKey`

Request: tanpa body. `buildingKey` harus valid menurut `config/buildings.ts`.

Response `200`:

json

```json
{ "room": { "...Room" } }
```

Error `404`: `{ "error": "Gedung tidak ditemukan" }` atau `{ "error": "Server tidak ditemukan" }`

##### Error `401` (semua endpoint)

json

```json
401 { "error": "Missing or invalid Authorization header" }
401 { "error": "Invalid or expired token" }
```

Error `500` juga bisa muncul jika profil gagal disiapkan: `{ "error": "Gagal menyiapkan profil user" }`.

---

### 2. Socket.IO

#### 2.1 Koneksi

ts

```ts
io(SERVER_URL, {
  auth: (cb) => cb({ token: getAccessToken() }),
});
```

Dengan `auth` berupa fungsi, token terbaru dipakai setiap kali socket connect ulang.

Kegagalan autentikasi, diterima lewat event `connect_error`:

| `error.message`               | Arti                               |
| ----------------------------- | ---------------------------------- |
| `Unauthorized: Missing token` | Token tidak dikirim                |
| `Unauthorized: Invalid token` | Token tidak valid atau kedaluwarsa |
| `Authentication error`        | Error internal saat verifikasi     |

#### 2.2 Event dari client ke server

| Event           | Payload                                                                                   | Keterangan                                                                      |
| --------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `room:join`     | `{ workspaceId, roomId, mode?: "auto" \| "code", currentPosition?, rotationY? }`          | Masuk ke room. `mode` default `"code"`. Tidak ada ack.                          |
| `player:move`   | `{ position: [x,y,z], rotationY, animation: "idle" \| "walk", zone? }`                    | Hanya valid setelah `room:join` berhasil. Tidak ada ack.                        |
| `player:status` | `{ status: "LIVE" \| "PAGI" \| "STANDUP" \| "ISTIRAHAT" \| "TAMU" }`                      | Hanya valid setelah join.                                                       |
| `chat:send`     | `{ channel: "GLOBAL" \| "PROXIMITY" \| "PRIVATE", content: string, receiverId?: string }` | Hanya valid setelah join. Pesan kosong diabaikan. `PRIVATE` wajib `receiverId`. |

#### 2.3 Event dari server ke client

| Event           | Payload                        | Kapan                                                       |
| --------------- | ------------------------------ | ----------------------------------------------------------- |
| `room:state`    | `PlayerState[]`                | Setelah join berhasil, berisi semua pemain di room tersebut |
| `player:joined` | `PlayerState`                  | Pemain lain masuk room                                      |
| `player:left`   | `{ socketId, userId }`         | Pemain keluar, pindah room, atau disconnect                 |
| `room:tick`     | `PlayerTick[]`                 | 20 kali per detik, posisi semua pemain di room              |
| `player:status` | `{ socketId, userId, status }` | Status pemain berubah                                       |
| `chat:receive`  | `ChatPacket`                   | Pesan chat masuk                                            |
| `server:full`   | `{ workspaceId, mode }`        | Server penuh saat `room:join`                               |
| `error:message` | `string`                       | Error dari `room:join` atau handler yang gagal              |

Tipe payload:

ts

```ts
type PlayerState = {
  socketId: string;
  userId: string;
  fullName: string;
  avatarUrl: string | null;
  avatarConfig: { color?: string; style?: string; character?: string };
  workspaceId: string;
  roomId: string;
  position: [number, number, number];
  rotationY: number;
  animation: "idle" | "walk";
  zone: string;
  isMicOn: boolean;
  isCamOn: boolean;
  role: "OWNER" | "ADMIN" | "MEMBER" | "GUEST";
  jobTitle: string | null;
  status: "LIVE" | "PAGI" | "STANDUP" | "ISTIRAHAT" | "TAMU";
};

type PlayerTick = {
  socketId: string;
  userId: string;
  position: [number, number, number];
  rotationY: number;
  animation: "idle" | "walk";
  zone: string;
};

type ChatPacket =
  | { id: string; channel: "GLOBAL"; senderId: string; senderName: string; content: string; createdAt: string }
  | { id: string; channel: "PROXIMITY"; senderId: string; senderName: string; content: string; createdAt: string }
  | { id: string; channel: "PRIVATE"; senderId: string; senderName: string; receiverId: string; content: string; createdAt: string };
```

#### 2.4 Aturan penting

- `chat:send` dan `player:move` diabaikan jika socket belum join room. Tunggu `room:state` sebelum mengirim.
- `room:join` ke room lain membuat sesi lama dihapus dan pemain lain menerima `player:left`.
- `PROXIMITY` tidak disimpan ke database. `GLOBAL` dan `PRIVATE` disimpan.
- Posisi awal default `[0, 0, 3]` jika `currentPosition` tidak dikirim.

---

### 3. Perbedaan bentuk data yang perlu dinormalisasi

Ini penting karena REST dan socket mengembalikan bentuk berbeda untuk pesan yang sama:

| Field         | REST `/messages`  | Socket `GLOBAL` |
| ------------- | ----------------- | --------------- |
| Nama pengirim | `sender.fullName` | `senderName`    |
| ID pengirim   | `senderId`        | `senderId`      |

| Field         | REST `/dms`    | Socket `PRIVATE` |
| ------------- | -------------- | ---------------- |
| Nama pengirim | `senderName`   | `senderName`     |
| Nama penerima | `receiverName` | tidak ada        |

Saran: buat satu fungsi `normalizeMessage()` di frontend yang menghasilkan bentuk seragam: `{ id, channel, senderId, senderName, receiverId?, content, createdAt }`.

Perbaikan di backend yang disarankan (opsional): tambahkan `senderName` dan `receiverName` di respons REST agar sama dengan socket.

---

### 4. Yang harus dilakukan frontend

#### A. Alur awal

1. Saat app dibuka, panggil `supabase.auth.getSession()`.
2. Jika ada sesi, langsung masuk dunia dan lewati formulir.
3. Jika tidak ada sesi, tampilkan formulir nama panggilan dan pilihan karakter (`karakter_1` atau `karakter_2`).
4. Saat “Mulai” ditekan, jalankan `startAsGuest(nickname, character)` dari `guest.ts`.
5. Setelah sesi tersedia, panggil `GET /api/workspaces` sebagai request pertama. Ini juga memicu `ensureProfile` di backend.

#### B. Pengiriman token

- Setiap request REST wajib menyertakan `Authorization: Bearer <access_token>`. Buat satu helper `apiFetch()` yang mengambil token dari sesi terbaru.
- Socket pakai `auth` berupa fungsi, seperti contoh di bagian 2.1.
- Dengarkan `supabase.auth.onAuthStateChange`. Saat event `TOKEN_REFRESHED`, pastikan socket memakai token terbaru. Dengan `auth` berupa fungsi, cukup `socket.disconnect().connect()` bila perlu.

#### C. Penanganan error REST

| Kondisi                                  | Tindakan                                                                                                  |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `401` dan refresh token berhasil         | Ulangi request sekali                                                                                     |
| `401` dan refresh gagal                  | Kembali ke formulir. Jangan panggil `signOut()` untuk tamu tanpa peringatan, karena identitas tamu hilang |
| `403` dengan `code: "GUEST_NOT_ALLOWED"` | Tampilkan modal ajakan login. Jangan tampilkan sebagai error merah                                        |
| `403` lain                               | Tampilkan pesan dari `error`                                                                              |
| `409` pada join                          | Tampilkan “Server sudah penuh” dan tawarkan quick join                                                    |
| `404` pada join                          | Tampilkan “Kode undangan tidak ditemukan”                                                                 |
| `500`                                    | Tampilkan pesan generik dan izinkan coba lagi                                                             |

#### D. Penanganan socket

- `connect_error`: jika pesan `Invalid token`, minta token baru lalu connect ulang. Jika `Missing token`, arahkan ke formulir.
- `server:full`: tampilkan pesan dan kembalikan pemain ke daftar server. Untuk `mode: "auto"`, ulangi quick join.
- `error:message`: tampilkan sebagai toast. Payload-nya string.
- Sebelum mengirim `chat:send` atau `player:move`, pastikan sudah menerima `room:state`.

#### E. Pembatasan untuk tamu

- Sembunyikan atau nonaktifkan tombol “Buat server” untuk tamu, dan ganti dengan ajakan login.
- Untuk menentukan tamu di frontend, pakai `session.user.is_anonymous === true`. Nilai ini hanya untuk tampilan, backend tetap menjadi sumber kebenaran.
- Fitur lain tetap bisa dipakai tamu: quick join, join dengan kode, chat, DM, dan gerak.

#### F. Menghubungkan akun (upgrade tamu)

1. Frontend memanggil `supabase.auth.updateUser({ email, password })` untuk email, atau `linkIdentity({ provider: "google" })` untuk Google. Jika `signup()` dipakai, kirim captcha token bila CAPTCHA sudah aktif.
2. Karena konfirmasi email nonaktif, sesi langsung diperbarui dan `is_anonymous` menjadi `false`. Jika Secure email change aktif, tampilkan pesan agar pemain mengecek email untuk konfirmasi perubahan, lalu cek ulang `is_anonymous` setelah konfirmasi.
3. Tombol “Buat server” aktif setelah `is_anonymous` berubah. Panggil `GET /api/workspaces` untuk memastikan data masih sama.
4. Socket tidak perlu diganti. Jika token berubah, connect ulang agar token baru dipakai.
5. User ID tidak berubah saat upgrade, jadi profil, keanggotaan, dan riwayat chat tetap terbawa.
6. Jika email sudah dipakai akun lain, Supabase menolak penautan. Tampilkan pesan dan biarkan pemain tetap sebagai tamu atau login ke akun tersebut. Data tamu tidak ikut pindah.

Catatan: user ID tidak berubah saat upgrade, jadi profil, keanggotaan, dan riwayat chat tetap terbawa.

Jika pemain mencoba upgrade dengan email yang sudah dipakai akun lain, Supabase akan menolak. Tampilkan pesan dan biarkan pemain tetap sebagai tamu atau login ke akun yang sudah ada. Data tamu akan hilang jika memilih login ke akun lain.

#### G. Karakter dan nama

- Nama panggilan disimpan lewat `user_metadata.full_name`, dan karakter lewat `user_metadata.character`.
- Untuk mengganti nama atau karakter setelah masuk, panggil `supabase.auth.updateUser({ data: { full_name, character } })`, lalu panggil `GET /api/workspaces` agar `ensureProfile` menyinkronkan profil. Setelah itu beri tahu pemain lain lewat socket dengan cara connect ulang atau menunggu join berikutnya, karena belum ada event untuk perubahan profil.
- Render avatar berdasarkan `avatarConfig.character` pada setiap `PlayerState`.

#### H. Lain-lain

- Gunakan `normalizeMessage()` seperti di bagian 3.
- `GET /api/workspaces` mengembalikan `inviteCode` hanya untuk server yang diikuti. Tampilkan tombol salin kode hanya jika `inviteCode` ada.
- Jika backend menambah event untuk perubahan profil nanti, tambahkan di bagian ini.

---

### 5. Hal yang belum ada di backend (perlu dicatat)

- Kursi cadangan 5 slot untuk teman belum diimplementasikan. Saat dibuat, batasi ke user non-tamu.
- `GET /api/rooms/:roomId/messages` belum memeriksa apakah user adalah member server tersebut. Siapa pun yang punya token bisa membaca riwayat room mana pun. Sebaiknya ditambahkan pengecekan `membership` seperti di endpoint DM.
- Belum ada event socket untuk perubahan profil, sehingga pemain lain tidak melihat perubahan nama atau karakter sampai join ulang.
