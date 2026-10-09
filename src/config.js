'use strict';

require('dotenv').config();

function required(name) {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(`Environment variable "${name}" wajib diisi. Lihat .env.example.`);
  }
  return value.trim();
}

const ownerIds = (process.env.OWNER_IDS || '')
  .split(',')
  .map((id) => id.trim())
  .filter(Boolean);

if (ownerIds.length === 0) {
  throw new Error('Environment variable "OWNER_IDS" wajib diisi minimal satu User ID.');
}

const config = {
  token: required('DISCORD_TOKEN'),
  clientId: required('CLIENT_ID'),
  guildId: (process.env.GUILD_ID || '').trim() || null,
  ownerIds,
  embedColor: (process.env.EMBED_COLOR || '#5865F2').trim(),
};

module.exports = config;