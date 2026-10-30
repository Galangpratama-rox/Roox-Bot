# Roox BOT

Bot Discord resmi berbasis Node.js + discord.js v14 dengan slash command `/embed`
yang hanya bisa dipakai oleh owner (berdasarkan User ID).

## Fitur

- Slash command `/embed` (owner-only) yang menampilkan **panel tombol** dengan
  **live preview**.
- Slash command `/games` (owner-only): **panel live "Roox Hub · Supported Games"**
  yang dikirim sekali lalu **di-edit otomatis** setiap daftar/status game berubah.
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

- Warna embed otomatis: semua 🟢 → hijau, ada 🟡 → kuning, ada 🔴 → merah.
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
| `/games media` | Atur thumbnail (kanan atas), banner GIF, author name/icon, title |
| `/games footer` | Atur teks & ikon footer |
| `/games refresh` | Paksa render + edit panel sekarang |
| `/games link message` | Adopsi pesan panel yang sudah ada (link pesan / `channelId/messageId`) |
| `/games sync` | Reset daftar game ke isi `src/data/games.js` (dengan konfirmasi) |
| `/games info` | Channel, pesan, total game, waktu update, lokasi state file |

### Penyimpanan & pemulihan

- Data runtime ada di `data/state.json` (bisa dipindah lewat env `DATA_DIR`):
  posisi pesan panel, daftar game, dan pengaturan media.
- Ditulis **atomic** dan digabung, jadi aman walau banyak update beruntun.
- **Restart** → bot membaca state dan meng-edit pesan yang sama (tidak kirim baru).
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
   | `DATA_DIR` | Tidak | Folder state panel live. Default `data`; di Railway isi path volume |

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
│  ├─ ready.js               # + bootstrap panel live /games
│  ├─ interactionCreate.js   # routing slash/button/modal/autocomplete + owner gate
│  └─ messageCreate.js       # auto-reply chat
├─ commands/
│  ├─ embed.js           # tampilkan panel embed
│  └─ games.js           # /games: panel live supported games
├─ interactions/
│  ├─ embedFlow.js       # handle tombol, submit modal, kirim
│  └─ gamesFlow.js       # modal media/footer, tombol sync, autocomplete
├─ services/
│  ├─ gemini.js          # wrapper REST Gemini
│  ├─ autoreply.js       # orkestrasi auto-reply
│  ├─ gameStore.js       # state panel live + persist ke data/state.json
│  └─ panelUpdater.js    # edit pesan panel, adopsi pinned, recovery
├─ data/
│  ├─ faq.js             # knowledge base (ISI SENDIRI)
│  └─ games.js           # seed daftar game + media panel (ISI SENDIRI)
├─ ui/
│  └─ embedPanel.js      # rakit preview + tombol + modal
└─ utils/
   ├─ isOwner.js
   ├─ embedState.js      # state panel sementara
   ├─ cooldown.js        # anti-spam auto-reply
   ├─ buildEmbed.js      # rakit embed dari state
   └─ buildGamesEmbed.js # rakit embed panel /games + guard limit Discord
```
