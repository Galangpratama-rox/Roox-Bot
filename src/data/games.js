'use strict';

// ============================================================================
// SEED PANEL LIVE "SORU HUB · Supported Games"
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
    authorName: 'SORU HUB',
    authorIcon: null,
    title: '🎮 Supported Games',
    subtitle: 'Game yang didukung SORU HUB',
    listTitle: '🎮 Games',
    // Gambar kecil di kanan atas (logo).
    thumbnail: null,
    // Banner besar di bawah (boleh GIF animasi).
    banner: null,
    footerPrefix: 'SORU HUB · Supported Games',
    footerIcon: null,
  },

  // Daftar game awal. Boleh string saja, atau { name, status }.
  games: [
    '+1 Mine Per Click',
    'Break Egg For Brainrot',
    'Tap Simulator Reborn',
    'Clone For Steal Egg',
    '+1 Throw Stone',
    'Climb For Animal Egg',
    'Break And Steal A Egg',
    'Volleyball Legends',
    'Prospecting',
    'Rodeo For Animal',
    '+1 Swing For Egg',
    'Chop Tree For Treasure',
    'Fish Riders',
    'Bike For Egg',
    '+1 Money Per Click',
    'Train Pets For Egg',
  ],
};
