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

  // Warna garis di tepi kiri embed (hex). Ganti di sini kalau mau warna lain.
  color: '#8B0000', // merah gelap

  // Teks & gambar panel. Gambar diunggah lewat `/games media` dan `/games footer`,
  // lalu disimpan di folder data/assets.
  media: {
    authorName: 'Roox Hub',
    authorIconFile: null,
    title: '🎮 Supported Games',
    subtitle: 'Game yang didukung Roox Hub',
    listTitle: '🎮 Games',
    // Gambar kecil di kanan atas (logo).
    thumbnailFile: null,
    // Banner besar di bawah (boleh GIF animasi).
    bannerFile: null,
    footerPrefix: 'Roox Hub · Supported Games',
    footerIconFile: null,
  },

  // Urutan pengecekan aset gambar panel.
  imageKinds: ['thumbnail', 'banner', 'authorIcon', 'footerIcon'],

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
