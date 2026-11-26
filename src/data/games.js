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
  // Ini isi default kalau state.json hilang/kosong (mis. redeploy Railway),
  // jadi pastikan daftar lengkap supaya tidak ada game yang hilang.
  games: [
    { name: 'Ride a Pet', status: 'working' },
    { name: 'Anime Dice', status: 'working' },
    { name: 'Break and Steal an egg', status: 'working' },
    { name: 'Fish Raider', status: 'updating' },
    { name: 'Climb For Animal', status: 'updating' },
    { name: 'Tap Simulator Reborn', status: 'working' },
    { name: 'Bike For Egg', status: 'working' },
    { name: 'STEAL A PET AND RIDE IT!', status: 'working' },
    { name: 'Throw Food For Animal', status: 'working' },
    { name: 'Anime Card Farm', status: 'working' },
    { name: 'Net Fish', status: 'working' },
    { name: 'MM2', status: 'updating' },
    { name: 'Cut a Rock', status: 'working' },
    { name: 'Save an Egg', status: 'down' },
    { name: 'Throw a Seed', status: 'working' },
    { name: 'Jump For Case', status: 'working' },
    { name: 'Steal a PC', status: 'working' },
    { name: 'Shoot Arrow For Animal', status: 'working' },
    { name: 'Throw A Spear For Fish', status: 'working' },
    { name: 'Malam Sama Opah', status: 'working' },
    { name: 'Shoot To Steal An Egg', status: 'working' },
    { name: 'Blade Ball', status: 'working' },
    { name: 'Fish For Sea Animals', status: 'working' },
    { name: 'Drag Drive Simulator (Beta)', status: 'working' },
    { name: 'Cast For Fish', status: 'working' },
  ],
};
