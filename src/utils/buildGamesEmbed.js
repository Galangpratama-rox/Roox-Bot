'use strict';

const crypto = require('node:crypto');
const { EmbedBuilder } = require('discord.js');
const seed = require('../data/games');

// Discord: description max 4096, value field max 1024, max 25 field,
// dan total karakter seluruh embed max 6000 (termasuk title/author/footer).
const DESC_BUDGET = 3900;
const FIELD_VALUE_LIMIT = 1024;
const MAX_FIELDS = 25;
const EMBED_CHAR_LIMIT = 6000;

/** Hindari nama game yang mengandung markdown merusak layout. */
function escapeMd(text) {
  return String(text).replace(/([*_~`|\\])/g, '\\$1');
}

function statusOf(status) {
  return seed.statuses[status] || seed.statuses[seed.defaultStatus];
}

function legendLine() {
  return Object.values(seed.statuses)
    .map((status) => `${status.emoji} ${status.label}`)
    .join(' · ');
}

/** Status terburuk menentukan warna embed. */
function worstStatus(games) {
  if (!games.length) return null;
  if (games.some((game) => game.status === 'down')) return 'down';
  if (games.some((game) => game.status === 'updating')) return 'updating';
  return 'working';
}

/**
 * Bagi baris game menjadi potongan yang muat di satu field (max 1024 char).
 * @param {string[]} gameLines
 */
function packFieldChunks(gameLines) {
  const chunks = [];
  let lines = [];
  let length = 0;

  for (const line of gameLines) {
    const extra = lines.length === 0 ? line.length : line.length + 1;

    if (length + extra > FIELD_VALUE_LIMIT && lines.length > 0) {
      chunks.push({ lines, count: lines.length });
      lines = [];
      length = 0;
    }

    lines.push(line);
    length += lines.length === 1 ? line.length : line.length + 1;
  }

  if (lines.length) chunks.push({ lines, count: lines.length });
  return chunks;
}

/**
 * Ambil potongan field sebanyak yang muat di batas field & total karakter embed.
 * @param {Array<{lines: string[], count: number}>} chunks
 * @param {string} listTitle
 * @param {number} charBudget
 */
function takeWithinBudget(chunks, listTitle, charBudget) {
  const kept = [];
  let used = 0;
  let shown = 0;

  for (const chunk of chunks) {
    if (kept.length >= MAX_FIELDS) break;

    const name = kept.length === 0 ? `**${listTitle}**` : `**${listTitle} (lanjutan)**`;
    const value = chunk.lines.join('\n');
    if (used + name.length + value.length > charBudget) break;

    kept.push({ name, value, count: chunk.count });
    used += name.length + value.length;
    shown += chunk.count;
  }

  return { kept, shown };
}

/**
 * Rakit embed panel dari state. Timestamp selalu baru, jadi hash dihitung
 * tanpa timestamp agar panelUpdater tahu kapan isinya benar-benar berubah.
 * @param {object} state
 * @param {{ timestamp?: boolean, now?: Date }} [options]
 * @returns {{ embed: EmbedBuilder, hash: string }}
 */
function buildGamesEmbed(state, options = {}) {
  const media = { ...seed.media, ...(state.media || {}) };
  const games = state.games || [];

  const embed = new EmbedBuilder();
  const worst = worstStatus(games);
  embed.setColor(worst ? seed.colors[worst] : seed.colors.empty);

  if (media.authorName) {
    embed.setAuthor({ name: media.authorName, iconURL: media.authorIcon || undefined });
  }
  if (media.title) embed.setTitle(media.title);

  const footerText = media.footerPrefix || media.authorName || seed.media.footerPrefix;
  if (footerText) {
    embed.setFooter({ text: footerText, iconURL: media.footerIcon || undefined });
  }

  // Sisa jatah karakter setelah title/author/footer dipakai.
  const overhead = [media.title, media.authorName, footerText]
    .filter(Boolean)
    .reduce((total, text) => total + text.length, 0);
  const charBudget = Math.max(1200, EMBED_CHAR_LIMIT - overhead - 120);

  const headLines = [media.subtitle, legendLine()].filter(Boolean).join('\n');
  const listTitle = `${media.listTitle || seed.media.listTitle} (${games.length})`;
  const gameLines = games.map((game) => `${statusOf(game.status).emoji} ${escapeMd(game.name)}`);

  if (!games.length) {
    embed.setDescription(
      [headLines, '_Belum ada game. Tambahkan lewat `/games add`._'].filter(Boolean).join('\n\n')
    );
  } else {
    const listBlock = [`**${listTitle}**`, ...gameLines].join('\n');
    const full = headLines ? `${headLines}\n\n${listBlock}` : listBlock;

    if (full.length <= Math.min(DESC_BUDGET, charBudget)) {
      embed.setDescription(full);
    } else {
      // Terlalu panjang untuk satu description: pindahkan daftar ke fields
      // dan hentikan saat jatah karakter embed habis.
      if (headLines) embed.setDescription(headLines);

      const chunks = packFieldChunks(gameLines);
      const { kept, shown } = takeWithinBudget(chunks, listTitle, charBudget - headLines.length);
      const remaining = games.length - shown;

      kept.forEach((chunk, index) => {
        let value = chunk.value;
        const isLast = index === kept.length - 1;
        if (isLast && remaining > 0) {
          const note = `_…dan ${remaining} game lainnya_`;
          if (value.length + note.length + 1 <= FIELD_VALUE_LIMIT) value = `${value}\n${note}`;
        }
        embed.addFields({ name: chunk.name, value, inline: false });
      });
    }
  }

  if (media.thumbnail) embed.setThumbnail(media.thumbnail);
  if (media.banner) embed.setImage(media.banner);

  const hash = hashEmbed(embed);
  if (options.timestamp !== false) embed.setTimestamp(options.now || new Date());

  return { embed, hash };
}

/**
 * Hash isi embed tanpa timestamp, supaya panel tidak di-edit hanya karena jam.
 * @param {EmbedBuilder} embed
 */
function hashEmbed(embed) {
  const data = { ...embed.toJSON() };
  delete data.timestamp;
  return crypto.createHash('sha1').update(JSON.stringify(data)).digest('hex');
}

module.exports = { buildGamesEmbed, legendLine, worstStatus };
