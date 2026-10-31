'use strict';

require('dotenv').config();

function required(name) {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(`Environment variable "${name}" wajib diisi. Lihat .env.example.`);
  }
  return value.trim();
}

function parseBool(value, fallback) {
  if (value === undefined || value.trim() === '') return fallback;
  return !['false', '0', 'off', 'no'].includes(value.trim().toLowerCase());
}

function parseList(value) {
  return (value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseNumber(value, fallback) {
  const num = Number.parseInt((value || '').trim(), 10);
  return Number.isFinite(num) && num > 0 ? num : fallback;
}

/**
 * Ambil ID channel dari env. Menerima ID angka atau URL channel Discord.
 * @param {string} envName
 * @returns {string|null}
 */
function parseChannelId(envName) {
  const raw = (process.env[envName] || '').trim();
  if (!raw) return null;
  if (/^\d{17,20}$/.test(raw)) return raw;

  const urlMatch = raw.match(/channels\/\d+\/(\d+)/);
  if (urlMatch) return urlMatch[1];

  console.warn(
    `[config] ${envName} harus berupa ID channel (angka) atau URL channel. ` +
      `Nilai "${raw}" diabaikan -> token akan jadi teks biasa.`
  );
  return null;
}

const ownerIds = parseList(process.env.OWNER_IDS);

if (ownerIds.length === 0) {
  throw new Error('Environment variable "OWNER_IDS" wajib diisi minimal satu User ID.');
}

const config = {
  token: required('DISCORD_TOKEN'),
  clientId: required('CLIENT_ID'),
  guildId: (process.env.GUILD_ID || '').trim() || null,
  ownerIds,
  embedColor: (process.env.EMBED_COLOR || '#5865F2').trim(),

  // Folder penyimpanan data runtime panel live. Kosong = ./data
  dataDir: (process.env.DATA_DIR || 'data').trim() || 'data',
  // Channel default per panel live. games: CHANNEL_GAMES atau CHANNEL_SUPPORT_GAME.
  gamesChannelId: parseChannelId('CHANNEL_GAMES') || parseChannelId('CHANNEL_SUPPORT_GAME'),
  panelChannels: {
    games: parseChannelId('CHANNEL_GAMES') || parseChannelId('CHANNEL_SUPPORT_GAME'),
    freemium: parseChannelId('CHANNEL_FREEMIUM'),
  },

  ticket: {
    // Kategori tiket (diisi lewat /ticket setup, ini hanya cadangan).
    categoryId: parseChannelId('TICKET_CATEGORY_ID'),
    categoryName: (process.env.TICKET_CATEGORY_NAME || 'Premium').trim(),
    // Role tambahan yang selalu boleh lihat tiket (selain role ber-Manage Channels).
    staffRoles: parseList(process.env.TICKET_STAFF_ROLES).filter((id) => /^\d{17,20}$/.test(id)),
    // (Opsional) role yang di-ping saat tiket baru dibuat.
    pingRoleId: /^\d{17,20}$/.test((process.env.TICKET_PING_ROLE_ID || '').trim())
      ? (process.env.TICKET_PING_ROLE_ID || '').trim()
      : null,
    cooldownMs: parseNumber(process.env.TICKET_COOLDOWN_MS, 30000),
  },

  autoReply: {
    enabled: parseBool(process.env.AUTOREPLY_ENABLED, true),
    channels: parseList(process.env.AUTOREPLY_CHANNELS),
    cooldownMs: parseNumber(process.env.AUTOREPLY_COOLDOWN_MS, 5000),
    maxLen: parseNumber(process.env.AUTOREPLY_MAX_LEN, 500),
    geminiApiKey: (process.env.GEMINI_API_KEY || '').trim() || null,
    geminiModel: (process.env.GEMINI_MODEL || 'gemini-3.5-flash').trim(),
    channelGetKey: parseChannelId('CHANNEL_GET_KEY'),
    channelGetScript: parseChannelId('CHANNEL_GET_SCRIPT'),
    channelSupportGame: parseChannelId('CHANNEL_SUPPORT_GAME'),
    channelSupportExecutor: parseChannelId('CHANNEL_SUPPORT_EXECUTOR'),
  },
};

if (config.autoReply.enabled && !config.autoReply.geminiApiKey) {
  console.warn('[config] AUTOREPLY aktif tapi GEMINI_API_KEY kosong. Hanya jawaban canned yang akan bekerja.');
}

module.exports = config;