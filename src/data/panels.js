'use strict';

// ============================================================================
// PANEL TEKS LIVE (selain panel daftar game `/games`)
//
// - "seedPanels" = panel yang otomatis dibuat saat pertama kali bot jalan.
// - "templates"  = pilihan untuk `/panel buat`.
// - Semua teks/gambar tetap bisa diubah lewat command `/panel ...`.
//   Isi di sini hanya nilai AWAL.
//
// Format section : { emoji, heading, body }   (body boleh multi-baris)
// Format tombol  : { type: 'link',   label, emoji, url }
//                  { type: 'reply',  label, emoji, reply }  (reply = teks balasan)
//                  { type: 'ticket', label, emoji }          (buka tiket privat)
// ============================================================================

const textMediaDefaults = {
  authorName: 'Roox Hub',
  authorIconFile: null,
  title: '🎮 Roox Hub Freemium Panel',
  // Warna garis tepi embed (hex).
  color: '#8B5CF6',
  // Gambar kecil di kanan atas (diunggah lewat `/panel media`).
  thumbnailFile: null,
  // Banner besar di bawah (boleh GIF animasi).
  bannerFile: null,
  footerText: 'Roox Hub ✦ Premium Access',
  footerIconFile: null,
};

const freemiumContent = {
  description:
    'Try **Ride a Pet**, **Anime Dice**, and more for free. One short ad step gets you a key.',
  sections: [
    {
      emoji: '📜',
      heading: 'How to Use',
      body: [
        '1. Hit **Get Free Key** below and finish the ad step',
        '2. Hit **Get Script** and copy the loader code that pops up',
        '3. Paste it into your executor once you are in the game',
        '4. A **Redeem Key** window opens on your first run. Paste your key there, once',
        'Next runs need no key until it expires. Then grab a new free key.',
      ].join('\n'),
    },
    {
      emoji: '🎩',
      heading: 'Want More Features?',
      body: 'Go Premium to unlock all features and every game. Get it in #purchase.',
    },
    {
      emoji: '❓',
      heading: 'Need Help?',
      body: 'Stuck somewhere? Open a ticket in #open-ticket and our staff will sort you out during business hours.',
    },
  ],
  buttons: [
    {
      id: 'getfreekey',
      type: 'link',
      label: 'Get Free Key',
      emoji: '🔑',
      url: 'https://rooxhub.my.id/#key',
    },
    {
      id: 'getscript',
      type: 'reply',
      label: 'Get Script',
      emoji: '🎮',
      reply:
        'loadstring(game:HttpGet("https://raw.githubusercontent.com/ZoraRox/RooxHub/refs/heads/main/RooxHub_Loader.lua"))()',
    },
  ],
};

const premiumContent = {
  description: 'Premium Keys for RooxHub are now ready.',
  sections: [
    {
      emoji: '💰',
      heading: 'Pricing',
      body: ['**7 Days:** IDR 10.000 / 10k', '**30 Days:** IDR 25.000 / 25k'].join('\n'),
    },
    {
      emoji: '📝',
      heading: 'Note',
      body: [
        '1 Premium Key can be used for up to **2 devices**.',
        'HWID reset is available.',
      ].join('\n'),
    },
    {
      emoji: '💳',
      heading: 'Payment Methods',
      body: 'QRIS / DANA / GoPay / Socialbuzz',
    },
  ],
  buttons: [
    {
      id: 'belipremium',
      type: 'ticket',
      label: 'Beli Premium',
      emoji: '🛒',
    },
  ],
};

module.exports = {
  textMediaDefaults,

  // Panel yang otomatis tersedia.
  seedPanels: {
    freemium: {
      media: { ...textMediaDefaults },
      content: freemiumContent,
    },
    premium: {
      media: {
        ...textMediaDefaults,
        authorName: 'Roox Hub',
        title: '🏛 Roox Hub Premium',
        footerText: 'Roox Hub ✦ Premium',
      },
      content: premiumContent,
    },
  },

  // Template untuk `/panel buat`.
  templates: {
    kosong: {
      media: { ...textMediaDefaults, title: 'Panel Baru', footerText: 'Roox Hub' },
      content: {
        description: 'Isi deskripsi lewat `/panel isi`.',
        sections: [],
        buttons: [],
      },
    },
    freemium: {
      media: { ...textMediaDefaults },
      content: freemiumContent,
    },
    premium: {
      media: {
        ...textMediaDefaults,
        title: '🏛 Roox Hub Premium',
        footerText: 'Roox Hub ✦ Premium',
      },
      content: premiumContent,
    },
  },
};
