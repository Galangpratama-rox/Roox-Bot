'use strict';

const crypto = require('node:crypto');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const panelsSeed = require('../data/panels');

// Discord: description max 4096, value field max 1024, max 25 field, total 6000.
const DESC_BUDGET = 3900;
const FIELD_VALUE_LIMIT = 1024;
const MAX_FIELDS = 25;
const EMBED_CHAR_LIMIT = 6000;
const FALLBACK_COLOR = 0x8b5cf6;
const MAX_BUTTONS = 25;

/** '#RRGGBB' -> integer warna. */
function parseColor(value) {
  const clean = String(value || '')
    .trim()
    .replace(/^#/, '');
  return /^[0-9a-fA-F]{6}$/.test(clean) ? parseInt(clean, 16) : null;
}

/** 'emoji heading' (tebal) + body. */
function formatSection(section = {}) {
  const heading = [section.emoji, section.heading].filter(Boolean).join(' ').trim();
  const body = typeof section.body === 'string' ? section.body.trim() : '';
  return [heading ? `**${heading}**` : null, body || null].filter(Boolean).join('\n');
}

function defaultResolveImage(media) {
  return (kind) => {
    const file = media[`${kind}File`];
    if (file) return `attachment://${file}`;
    return media[kind] || null;
  };
}

/** Hash isi panel tanpa timestamp & tanpa URL gambar (yang bisa berubah). */
function hashContent(media, content) {
  const payload = {
    media: {
      authorName: media.authorName,
      title: media.title,
      color: media.color,
      footerText: media.footerText,
      thumbnailFile: media.thumbnailFile,
      bannerFile: media.bannerFile,
      authorIconFile: media.authorIconFile,
      footerIconFile: media.footerIconFile,
    },
    content: content || {},
  };
  return crypto.createHash('sha1').update(JSON.stringify(payload)).digest('hex');
}

/**
 * Baris tombol panel: `link` -> tombol URL, `reply` -> tombol aksi bot.
 * @param {Array<object>} buttons
 * @param {string} key nama panel
 * @returns {ActionRowBuilder[]}
 */
function buildButtonRows(buttons = [], key = 'panel') {
  const rows = [];

  for (let i = 0; i < buttons.length && i < MAX_BUTTONS; i += 5) {
    const row = new ActionRowBuilder();

    for (const button of buttons.slice(i, i + 5)) {
      if (!button?.label) continue;

      const isLink = button.type === 'link';
      const builder = new ButtonBuilder()
        .setLabel(String(button.label).slice(0, 80))
        .setStyle(isLink ? ButtonStyle.Link : ButtonStyle.Primary);

      if (button.emoji) builder.setEmoji(button.emoji);
      if (isLink) builder.setURL(button.url);
      else builder.setCustomId(`pnl:${key}:b:${button.id}`);

      row.addComponents(builder);
    }

    if (row.components.length) rows.push(row);
  }

  return rows;
}

/**
 * Bagi body panjang menjadi potongan yang muat satu field.
 * @param {string} value
 */
function chunkValue(value, limit = FIELD_VALUE_LIMIT) {
  const chunks = [];
  let current = '';

  for (const line of String(value).split('\n')) {
    const next = current ? `${current}\n${line}` : line;
    if (next.length > limit && current) {
      chunks.push(current);
      current = line.slice(0, limit);
    } else {
      current = next.length > limit ? next.slice(0, limit) : next;
    }
  }

  if (current) chunks.push(current);
  return chunks;
}

/**
 * Rakit embed panel teks dari data panel.
 * @param {object} panelData
 * @param {{ key?: string, resolveImage?: (kind: string) => string|null, timestamp?: boolean, now?: Date }} [options]
 * @returns {{ embed: EmbedBuilder, hash: string, components: ActionRowBuilder[] }}
 */
function buildTextEmbed(panelData, options = {}) {
  const key = options.key || 'panel';
  const media = { ...panelsSeed.textMediaDefaults, ...(panelData?.media || {}) };
  const content = panelData?.content || {};
  const resolveImage = options.resolveImage || defaultResolveImage(media);

  const embed = new EmbedBuilder();
  embed.setColor(parseColor(media.color) ?? FALLBACK_COLOR);

  const authorIcon = resolveImage('authorIcon');
  if (media.authorName || authorIcon) {
    embed.setAuthor({
      name: media.authorName || panelsSeed.textMediaDefaults.authorName,
      iconURL: authorIcon || undefined,
    });
  }
  if (media.title) embed.setTitle(media.title);

  const footerIcon = resolveImage('footerIcon');
  if (media.footerText || footerIcon) {
    embed.setFooter({ text: media.footerText || '', iconURL: footerIcon || undefined });
  }

  const overhead =
    [media.title, media.authorName, media.footerText].filter(Boolean).reduce((total, text) => total + text.length, 0) +
    40;
  const valueBudget = Math.max(1000, EMBED_CHAR_LIMIT - overhead);
  const descBudget = Math.min(DESC_BUDGET, valueBudget);

  const blocks = [];
  if (content.description) blocks.push(String(content.description).trim());
  for (const section of content.sections || []) {
    const text = formatSection(section);
    if (text) blocks.push(text);
  }

  const full = blocks.join('\n\n');
  if (!blocks.length) {
    embed.setDescription('_Panel masih kosong. Isi lewat `/panel isi`._');
  } else if (full.length <= descBudget) {
    embed.setDescription(full);
  } else {
    // Terlalu panjang: deskripsi diisi sampai batas, sisanya jadi fields.
    const inlineBlocks = [];
    let used = 0;
    let index = 0;

    while (index < blocks.length) {
      const block = blocks[index];
      const extra = inlineBlocks.length ? block.length + 2 : block.length;
      if (used + extra > descBudget) break;
      inlineBlocks.push(block);
      used += extra;
      index += 1;
    }

    embed.setDescription(inlineBlocks.join('\n\n') || null);

    let fieldChars = 0;
    let added = 0;
    for (; index < blocks.length; index += 1) {
      const block = blocks[index];
      if (added >= MAX_FIELDS) break;

      const section = content.sections?.[index - (content.description ? 1 : 0)] || {};
      const name = [section.emoji, section.heading].filter(Boolean).join(' ').trim() || `Bagian ${added + 1}`;
      const body = section.body?.trim() || block;

      const chunks = chunkValue(body);
      const remainingSections = blocks.length - index - 1;

      for (const chunk of chunks) {
        if (added >= MAX_FIELDS) break;
        let value = chunk;
        const isLastChunk = chunk === chunks[chunks.length - 1];
        if (isLastChunk && remainingSections > 0) {
          const note = `_…dan ${remainingSections} bagian lainnya_`;
          if (value.length + note.length + 1 <= FIELD_VALUE_LIMIT) value = `${value}\n${note}`;
        }
        if (fieldChars + name.length + value.length + overhead > EMBED_CHAR_LIMIT) break;

        embed.addFields({ name: name.slice(0, 256), value, inline: false });
        fieldChars += name.length + value.length;
        added += 1;
      }
    }
  }

  const thumbnail = resolveImage('thumbnail');
  if (thumbnail) embed.setThumbnail(thumbnail);

  const banner = resolveImage('banner');
  if (banner) embed.setImage(banner);

  const hash = hashContent(media, content);
  if (options.timestamp !== false) embed.setTimestamp(options.now || new Date());

  return { embed, hash, components: buildButtonRows(content.buttons, key) };
}

module.exports = { buildTextEmbed, buildButtonRows, formatSection, parseColor };
