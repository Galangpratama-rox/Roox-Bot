'use strict';

// ============================================================================
// SEED PENGUMUMAN "New Game" (command /newgame)
//
// Semua nilai di sini hanya DEFAULT. Setiap kali /newgame dipakai, isi embed
// diambil dari modal, jadi kamu tetap bisa mengubah tiap announce. Ubah file
// ini kalau mau mengganti teks bawaan (nama hub, template deskripsi, loader,
// dan kalimat channel key/loader).
// ============================================================================

module.exports = {
  // Warna garis tepi embed (hex).
  color: '#5865F2',

  // Author di atas judul + ikonnya (ikon diunggah lewat modal? tidak; isi
  // dengan URL atau biarkan null).
  authorName: 'Roox Hub',
  authorIcon: null,

  // Judul embed: "<titlePrefix>: <nama game>".
  titlePrefix: 'New Game',

  // Template deskripsi. {name} diganti nama game.
  descriptionTemplate: '{name} is now officially supported by Roox Hub.',

  // Judul bagian daftar fitur & bagian script.
  featuresHeading: 'Available Features',
  scriptHeading: 'Script',

  // Loader bawaan (boleh diubah tiap announce lewat modal).
  defaultScript:
    'loadstring(game:HttpGet("https://raw.githubusercontent.com/ZoraRox/RooxHub/refs/heads/main/RooxHub_Loader.lua"))()',

  // Kalimat channel. {channel} diganti mention channel yang dipilih di modal.
  // Baris otomatis dilewati kalau channel-nya belum dipilih.
  keyLine: 'Get your key in {channel}.',
  loaderLine: 'Get the official loader in {channel}.',

  // Bahasa code block (untuk syntax highlight).
  // 'diff' membuat baris "+ Fitur" berwarna hijau seperti contoh.
  featuresLanguage: 'diff',
  scriptLanguage: 'lua',
};
