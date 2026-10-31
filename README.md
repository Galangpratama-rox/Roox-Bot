# Roox BOT

Bot Discord resmi berbasis Node.js + discord.js v14 dengan slash command `/embed`
yang hanya bisa dipakai oleh owner (berdasarkan User ID).

## Fitur

- Slash command `/embed` (owner-only) yang menampilkan **panel tombol** dengan
  **live preview**.
- Slash command `/games` (owner-only): **panel live "Roox Hub · Supported Games"**
  yang dikirim sekali lalu **di-edit otomatis** setiap daftar/status game berubah.
- Slash command `/panel` (owner-only): **panel teks live** (freemium/premium) dengan
  bagian-bagian teks, tombol link ke website, dan tombol aksi bot (balasan ephemeral).
- **Sistem tiket** (pengganti Ticket Tool): tombol di panel membuat channel tiket
  privat di kategori, dengan tombol Tutup / Buka lagi / Hapus.
- Input lewat **pop-up modal** (form): Title, Description, URL, Color, Channel,
  Image (upload/URL), Thumbnail, Author, Footer, Fields, Timestamp.
- **Tombol link** pada embed: user klik tombol → diarahkan ke URL.
- **Gambar bergerak (GIF/WebP animasi/APNG)** didukung, baik dari upload
  maupun dari Image URL.
- Kirim ke channel pilihan, atau otomatis ke channel tempat command dipakai.
- **Auto-reply** tanpa prefix: bot mendeteksi pertanyaan soal **key** & **script**
  di chat biasa lalu membalas (canned + Gemini AI).
- Blokir otomatis untuk non-owner (semua interaksi).
- Health server untuk Railway.

## Cara Pakai `/embed`

1. Jalankan `/embed` → muncul panel dengan preview dan tombol.
2. Klik **Isi Utama** / **Media** / **Footer & Fields** / **Tombol Link** → isi form pop-up.
   - Gambar bergerak: upload file `.gif` di **Media → Upload Image**, atau isi
     **Image URL** dengan link berakhiran `.gif` (mis. Tenor/Giphy).
3. Preview di panel langsung ter-update setiap kali form disimpan.
4. Klik **Kirim** untuk mengirim embed ke channel tujuan.
5. Tombol **Reset** mengosongkan isian, **Batal** menutup panel.

## Panel Live `/games` (Supported Games)

Satu embed yang **dikirim sekali** lalu **di-edit bot** setiap ada perubahan, jadi
tidak ada spam pesan baru. Cocok untuk papan status "game mana yang working".

Tampilan embed:

```
Roox Hub                        <- author (ikon opsional)
🎮 Supported Games              <- title
Game yang didukung Roox Hub     <- description
🟢 Working · 🟡 Updating · 🔴 Down

**🎮 Games (10)**
🟢 Ride a Pet
🟢 Anime Dice
...                             <- thumbnail (kanan atas) + banner GIF (bawah)
Roox Hub · Supported Games • 24/10/2026 08:08   <- footer + timestamp
```

- Garis tepi embed **merah gelap** (`#8B0000`). Ubah di `src/data/games.js` (`color`).
- Gambar diunggah **langsung lewat modal** (bukan paste URL) dan disimpan di
  `data/assets`. GIF animasi didukung untuk banner maupun thumbnail.
- Timestamp = waktu update terakhir.
- Kalau game terlalu banyak untuk satu embed, daftar otomatis dipindah ke
  fields dan dipotong dengan catatan `…dan N game lainnya` (batas Discord).

### Command

| Command | Fungsi |
|---|---|
| `/games panel [channel]` | Kirim panel pertama, atau pindah/pulihkan panel di channel itu |
| `/games add name [status]` | Tambah game (default `🟢 Working`) |
| `/games set name status` | Ubah status game (nama ada autocomplete) |
| `/games rename name new_name` | Ganti nama game |
| `/games remove name` | Hapus game |
| `/games list` | Lihat daftar + jumlah per status (ephemeral) |
| `/games media` | Upload thumbnail (kanan atas), banner GIF, author icon + atur author name & title |
| `/games footer` | Upload ikon footer + atur teks footer |
| `/games refresh` | Paksa render + edit panel sekarang |
| `/games link message` | Adopsi pesan panel yang sudah ada (link pesan / `channelId/messageId`) |
| `/games sync` | Reset daftar game ke isi `src/data/games.js` (dengan konfirmasi) |
| `/games info` | Channel, pesan, total game, waktu update, lokasi state file |

### Penyimpanan & pemulihan

- Data runtime ada di `data/state.json` (bisa dipindah lewat env `DATA_DIR`):
  posisi pesan panel, daftar game, dan pengaturan media.
- Gambar hasil upload disimpan di `data/assets`. Gambar yang diunggah **sekali**
  akan menempel di pesan panel, jadi update-nya tidak mengunggah ulang file
  (hemat bandwidth dan tidak kena URL kedaluwarsa).
- Nama file gambar diberi tag jenis (`banner-…`, `thumbnail-…`, `authoricon-…`,
  `footericon-…`), sehingga kalau `state.json` hilang, panel bisa memulihkan
  gambarnya otomatis dari lampiran yang masih menempel di pesan.
- Ditulis **atomic** dan digabung, jadi aman walau banyak update beruntun.
- **Restart** → bot membaca state dan meng-edit pesan yang sama (tidak kirim baru).
- **Gambar hilang dari disk (redeploy tanpa volume)** → panel tetap tampil normal
  karena gambarnya masih menempel di pesan. Kalau pesan panel sampai hilang juga,
  upload ulang gambarnya lewat `/games media`.
- **State hilang (redeploy)** → bot mencari **pesan pinned** miliknya di channel
  dan mengadopsinya, jadi panel tetap satu. Daftar game kembali ke seed
  `src/data/games.js` saat itu; jalankan `/games panel` / `/games sync` bila perlu.
- **Pesan panel dihapus manual** → update berikutnya mengirim panel baru di
  channel yang sama, mem-pin-nya, lalu menyimpan id barunya.
- Butuh izin bot: **View Channel, Send Messages, Embed Links** dan
  **Read Message History** (untuk adopsi pinned). `Manage Messages` diperlukan
  agar panel bisa di-pin otomatis.
- **Railway:** disk container bisa hilang saat redeploy. Kalau tidak mau mount
  volume, cukup pastikan panel tetap di-pin agar bisa diadopsi ulang. Kalau mau
  data benar-benar permanen, mount volume lalu set `DATA_DIR=/data`.

## Panel Teks `/panel`

Selain papan daftar game, bot bisa mengelola **banyak panel teks** (mis. panel
Freemium/Premium) dengan isi bebas: judul, paragraf, beberapa **bagian**
(heading + isi multi-baris), footer, dan **tombol**.

Sama seperti `/games`: dikirim sekali lalu bot yang meng-edit pesannya, bisa
mengadopsi pesan pinned, dan mengembalikan gambar setelah redeploy.

### Command

| Command | Fungsi |
|---|---|
| `/panel buat name template` | Buat panel baru (template `kosong` atau `freemium`) |
| `/panel panel name [channel]` | Kirim / pindah / pulihkan panel di channel |
| `/panel isi name` | Modal: Title, Description, Color, Author Name |
| `/panel bagian name aksi nomor` | `tambah` / `edit` / `hapus` bagian (section) |
| `/panel tombol name` | Modal: atur daftar tombol |
| `/panel balasan name tombol` | Modal: isi teks balasan tombol bertipe `reply` |
| `/panel media name` | Upload thumbnail (kanan atas), banner GIF, author icon |
| `/panel footer name` | Footer text + ikon footer |
| `/panel refresh name` | Paksa render + edit sekarang |
| `/panel info name` | Lihat isi panel, daftar bagian & tombol |
| `/panel hapus name` | Hapus panel dari bot (pesan di channel tetap ada) |

### Format tombol

Satu baris per tombol, format: `Label | emoji | aksi`

```
🔑 Get Free Key | 🔑 | link:https://rooxhub.my.id/#key
🎮 Get Script | 🎮 | reply
```

- `link:URL` → **tombol link** (mengarah ke URL, diklik semua orang).
- `reply` → **tombol aksi bot**: saat diklik member, bot membalas **ephemeral**
  (hanya yang klik) dengan teks dari `/panel balasan`. Kalau teksnya belum
  dibungkus ` ``` `, bot otomatis membungkusnya jadi code block supaya mudah
  di-copy (mis. loader).
- `ticket` → **tombol buat tiket**: saat diklik member, bot membuat channel tiket
  privat (lihat seksi "Sistem Tiket").
- Maksimal 25 tombol, 5 per baris.
- Saat mengedit daftar tombol, teks balasan tombol `reply` yang labelnya tidak
  berubah akan tetap tersimpan.

Tombol publik tidak terkena pembatasan owner, tapi dibatasi cooldown 3 detik per
user agar tidak spam.

### Multi-panel & migrasi

- Semua panel disimpan di satu `data/state.json` dengan format `version: 2`
  (`panels: { games, freemium, ... }`).
- State versi lama (sebelumnya hanya `panel`/`media`/`games` di root) otomatis
  dimigrasikan; file lamanya disalin ke `data/state.v1.bak.json`.
- Hapus panel dengan `/panel hapus`; panel `games` adalah fitur inti dan selalu ada.

## Sistem Tiket

Pengganti bot Ticket Tool: tombol panel bisa **membuat channel tiket privat** di
kategori yang kamu tentukan, lengkap dengan tombol **Tutup / Buka lagi / Hapus**.

### Setup

1. Pastikan bot punya izin **Manage Channels** + **Manage Roles**, dan posisi
   role bot **di atas** role staff.
2. Jalankan `/ticket setup category:#Premium` (sekali saja). Bot menyimpan
   kategorinya, mengecek izin, dan melanjutkan penomoran dari channel `ticket-####`
   yang sudah ada di kategori itu.
3. Kirim panel dengan tombol tiket:
   - `/panel panel name:premium channel:#premium-panel` — panel Premium
     (info harga + tombol `🛒 Beli Premium`), atau
   - `/ticket panel channel:#ticket` — panel sederhana "Buat Tiket".

### Perilaku

- Klik tombol tiket → dibuat channel `ticket-0070` (4 digit, lanjut dari nomor
  terakhir) di kategori, **privat**: `@everyone` tidak bisa lihat, hanya pembuat
  tiket + role/member yang punya **Manage Channels**.
- 1 tiket **open** per user (kalau sudah ada, bot kasih link tiketnya) + cooldown
  (default 30 detik).
- **Tutup** → pembuat tidak bisa kirim lagi, nama jadi `closed-0070`,
  tombol berubah jadi Buka lagi + Hapus. **Hapus** khusus staff dan pakai konfirmasi.
- Tidak ada transcript. State tiket disimpan di `data/tickets.json`.
- Kalau channel dihapus manual, entry-nya dibersihkan otomatis (atau lewat `/ticket list`).

### Command

| Command | Fungsi |
|---|---|
| `/ticket setup [category]` | Pilih kategori tiket + cek izin bot |
| `/ticket panel [channel]` | Kirim panel "Buat Tiket" (pesan lama di-update, bukan dobel) |
| `/ticket list` | Daftar tiket + bersihkan entry yang channelnya hilang |
| `/ticket info` | Konfigurasi, jumlah tiket, status izin bot |

## Persyaratan

- Node.js 18 atau lebih baru.
- Bot sudah dibuat di [Discord Developer Portal](https://discord.com/developers/applications).
- **Message Content Intent** aktif (wajib untuk fitur auto-reply).

## Setup

1. Install dependency:

   ```bash
   npm install
   ```

2. Copy `.env.example` menjadi `.env`, lalu isi:

   ```bash
   cp .env.example .env
   ```

   | Variabel | Wajib | Keterangan |
   |---|---|---|
   | `DISCORD_TOKEN` | Ya | Token bot |
   | `CLIENT_ID` | Ya | Application ID |
   | `OWNER_IDS` | Ya | User ID owner, pisah dengan koma |
   | `GUILD_ID` | Tidak | Isi untuk registrasi command instan di satu server |
   | `EMBED_COLOR` | Tidak | Warna default, contoh `#5865F2` |
   | `GEMINI_API_KEY` | Ya* | API key Gemini (untuk auto-reply AI) |
   | `GEMINI_MODEL` | Tidak | Default `gemini-3.5-flash` |
   | `AUTOREPLY_ENABLED` | Tidak | Default `true` |
   | `AUTOREPLY_CHANNELS` | Tidak | ID channel, pisah koma (kosong = semua) |
   | `AUTOREPLY_COOLDOWN_MS` | Tidak | Default `5000` |
   | `AUTOREPLY_MAX_LEN` | Tidak | Default `500` |
   | `CHANNEL_GET_KEY` | Tidak | ID channel #get-key (untuk token `{get-key}`) |
   | `CHANNEL_GET_SCRIPT` | Tidak | ID channel #get-script (untuk token `{get-script}`) |
   | `CHANNEL_SUPPORT_GAME` | Tidak | ID channel support-game (token `{support-game}`) |
   | `CHANNEL_SUPPORT_EXECUTOR` | Tidak | ID channel support-executor (token `{support-executor}`) |
   | `CHANNEL_GAMES` | Tidak | Channel default panel live `/games` (kosong = `CHANNEL_SUPPORT_GAME`) |
   | `CHANNEL_FREEMIUM` | Tidak | Channel default panel teks `freemium` (`/panel`) |
   | `DATA_DIR` | Tidak | Folder state & gambar panel. Default `data`; di Railway isi path volume |
   | `TICKET_CATEGORY_ID` | Tidak | Kategori tiket (cadangan; biasanya cukup `/ticket setup`) |
   | `TICKET_CATEGORY_NAME` | Tidak | Nama kategori yang dicari otomatis. Default `Premium` |
   | `TICKET_STAFF_ROLES` | Tidak | Role tambahan yang boleh lihat tiket (ID, pisah koma) |
   | `TICKET_PING_ROLE_ID` | Tidak | Role yang di-ping saat tiket baru dibuat |
   | `TICKET_COOLDOWN_MS` | Tidak | Jeda antar pembuatan tiket per user. Default `30000` |

   \* Wajib bila auto-reply AI dipakai; tanpa itu hanya jawaban canned yang jalan.

3. **Aktifkan Message Content Intent** di Developer Portal →
   **Bot → Privileged Gateway Intents → Message Content Intent: ON**.
   Undang bot dengan scope `applications.commands` dan `bot`.

4. Registrasi slash command:

   ```bash
   npm run deploy
   ```

5. Jalankan bot:

   ```bash
   npm start
   ```

## Cara Mendapatkan User ID

Aktifkan Developer Mode di Discord (User Settings > Advanced > Developer Mode),
klik kanan nama kamu, lalu **Copy User ID**.

## Catatan Fields

Format fields memakai JSON:

```json
[
  { "name": "Status", "value": "Online", "inline": true },
  { "name": "Versi", "value": "1.2.0", "inline": true }
]
```

## Catatan Tombol Link

Di modal **Tombol Link**, isi satu baris per tombol dengan format:

```
Label | https://url
```

Contoh:

```
Website | https://example.com
Gabung Discord | https://discord.gg/xxxx
```

- Maksimal 25 tombol (5 per baris).
- URL harus diawali `http://` atau `https://`.
- Label maksimal 80 karakter.

## Auto-Reply (Key & Script)

Bot membaca chat biasa **tanpa prefix** dan membalas **hanya kalau user beneran
nanya di mana / cara dapet** key, script/SC, game/map, atau executor.

**Alur (gerbang bertingkat):**
1. Wajib ada **kata kunci topik** + niat nyari sumber (`sourceIntent`) atau `?`.
2. Kalau cuma ngobrol soal sc/key (ada `negativeWords` seperti kapan/kenapa/fix/bug)
   tanpa nanya lokasi → **diam**.
3. Cocok pola di `src/data/faq.js` → balas jawaban canned.
4. Tidak cocok → tanya **Gemini** (bahasa santai). Jika Gemini bilang `SKIP` →
   bot diam. Kalau Gemini gagal/limit → kirim `fallback`.

**Contoh:**
| Pesan | Hasil |
|---|---|
| `dimana sc nya?` | dijawab |
| `gamenya apa aja` | dijawab |
| `kapan diperbaiki sc climb for animal` | diam |
| `pengen borong egg royal` | diam |

**Konfigurasi:**
- Isi jawabanmu di `src/data/faq.js` (`entries`, opsional `channelEntries`).
- Atur kata pemicu di `sourceIntent`, `strongIntent`, `negativeWords`.
- Token channel otomatis diganti mention sesuai env:
  - `{get-key}` → `CHANNEL_GET_KEY`
  - `{get-script}` → `CHANNEL_GET_SCRIPT`
  - `{support-game}` → `CHANNEL_SUPPORT_GAME`
  - `{support-executor}` → `CHANNEL_SUPPORT_EXECUTOR`
- Isi env channel dengan **ID angka** (bukan `#nama`). URL channel juga diterima
  (otomatis diambil ID-nya).
- `answer` boleh teks biasa atau objek embed:
  `{ title, description, color, fields, links, thumbnail, imageUrl,
     authorName, authorIcon, footer, footerIcon, timestamp }`.

**Pertanyaan yang ditangani:** cara dapat key, cara dapat script/SC, game & map
yang didukung, dan executor — masing-masing diarahkan ke channel yang sesuai.

**Catatan:**
- Perlu **Message Content Intent** (lihat Persyaratan).
- Aktivitas dibatasi `AUTOREPLY_COOLDOWN_MS` per user & per channel.
- Pesan pemicu dikirim ke Google (Gemini) untuk dinilai/dijawab.
- `gemini.js` punya retry ringan + timeout; bot tidak akan crash kalau Gemini error.

## Deploy ke Railway

1. Push folder ini ke repository GitHub.
2. Di [Railway](https://railway.app), **New Project > Deploy from GitHub repo**.
3. Buka tab **Variables**, tambahkan `DISCORD_TOKEN`, `CLIENT_ID`, `OWNER_IDS`
   (dan `GUILD_ID` bila perlu). Jangan commit file `.env`.
4. Railway memakai Nixpacks: build `npm install`, start `node src/index.js`.
5. Jalankan `npm run deploy` sekali dari lokal untuk mendaftarkan command.
6. Health check tersedia di `/health` pada `PORT` yang diberikan Railway.

## Struktur

```
src/
├─ index.js              # entry point + health server
├─ config.js             # baca & validasi env
├─ deploy-commands.js    # registrasi slash command
├─ events/
│  ├─ ready.js               # + bootstrap semua panel live
│  ├─ interactionCreate.js   # routing slash/button/modal/autocomplete + owner gate
│  └─ messageCreate.js       # auto-reply chat
├─ commands/
│  ├─ embed.js           # tampilkan panel embed
│  ├─ games.js           # /games: panel live supported games
│  ├─ panel.js           # /panel: panel teks live (freemium, premium, dll)
│  └─ ticket.js          # /ticket: setup kategori + panel tiket
├─ interactions/
│  ├─ embedFlow.js       # handle tombol, submit modal, kirim
│  ├─ gamesFlow.js       # modal media/footer, tombol sync, autocomplete
│  ├─ panelFlow.js       # modal panel teks, tombol publik, autocomplete
│  └─ ticketFlow.js      # tombol buat/tutup/buka/hapus tiket
├─ services/
│  ├─ gemini.js          # wrapper REST Gemini
│  ├─ autoreply.js       # orkestrasi auto-reply
│  ├─ panelStore.js      # state multi-panel (v2) + migrasi dari v1
│  ├─ gameStore.js       # adapter panel "games" di atas panelStore
│  ├─ assetStore.js      # simpan/ambil gambar upload panel (data/assets)
│  ├─ panelUpdater.js    # edit pesan panel, adopsi pinned, recovery
│  ├─ ticketStore.js     # state tiket (data/tickets.json)
│  └─ ticketManager.js   # buat/tutup/buka/hapus tiket + izin channel
├─ data/
│  ├─ faq.js             # knowledge base (ISI SENDIRI)
│  ├─ games.js           # seed daftar game + media panel games (ISI SENDIRI)
│  └─ panels.js          # seed panel teks (freemium, premium) + template (ISI SENDIRI)
├─ ui/
│  └─ embedPanel.js      # rakit preview + tombol + modal
└─ utils/
   ├─ isOwner.js
   ├─ embedState.js      # state panel sementara
   ├─ cooldown.js        # anti-spam auto-reply & tombol panel
   ├─ buildEmbed.js      # rakit embed dari state
   ├─ buildGamesEmbed.js # rakit embed panel /games + guard limit Discord
   └─ buildTextEmbed.js  # rakit embed panel teks + baris tombol
```
