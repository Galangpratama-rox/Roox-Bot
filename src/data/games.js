'use strict';

// ============================================================================
// SEED PANEL LIVE "Roox Hub · Supported Games"
//
// File ini hanya nilai AWAL / default. Setelah bot jalan, daftar game, status,
// dan media disimpan di data/state.json (runtime) dan diubah lewat `/games`.
// Pakai `/games sync` untuk mengembalikan daftar ke isi file ini.
// ============================================================================

// Status yang tersedia. Nilai key dipakai di command & state.
const statuses = {
  working: { emoji: '🟢', label: 'Working' },
  updating: { emoji: '🟡', label: 'Updating' },
  down: { emoji: '🔴', label: 'Down' },
};

module.exports = {
  statuses,
  defaultStatus: 'working',

  // Warna embed otomatis mengikuti status terburuk.
  colors: {
    working: 0x57f287, // hijau
    updating: 0xfee75c, // kuning
    down: 0xed4245, // merah
    empty: 0x5865f2, // biru (belum ada game)
  },

  // Teks & gambar panel. Semua bisa diubah lewat `/games media` dan `/games footer`.
  media: {
    authorName: 'Roox Hub',
    authorIcon: null,
    title: '🎮 Supported Games',
    subtitle: 'Game yang didukung Roox Hub',
    listTitle: '🎮 Games',
    // Gambar kecil di kanan atas (logo).
    thumbnail: null,
    // Banner besar di bawah (boleh GIF animasi).
    banner: null,
    footerPrefix: 'Roox Hub · Supported Games',
    footerIcon: null,
  },

  // Daftar game awal. Boleh string saja, atau { name, status }.
  games: [
    'Ride a Pet',
    'Anime Dice',
    'Break and Steal an egg',
    'Fish Raider',
    'Climb For Animal',
    'Tap Simulator Reborn',
    'Bike For Egg',
    'STEAL A PET AND RIDE IT!',
    'Throw Food For Animal',
    'Anime Card Farm',
  ],
};
