'use strict';

const { EmbedBuilder, AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const config = require('../config');

const MAX_FIELDS = 25;
const MAX_LINKS = 25;

/**
 * Ubah string hex (#RRGGBB / RRGGBB) menjadi integer warna.
 * @param {string|null|undefined} hex
 * @returns {number}
 */
function parseColor(hex) {
  if (!hex) {
    return parseInt(config.embedColor.replace('#', ''), 16);
  }
  const clean = String(hex).trim().replace(/^#/, '');
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) {
    throw new Error(`Warna "${hex}" tidak valid. Gunakan format hex, contoh: #5865F2.`);
  }
  return parseInt(clean, 16);
}

/**
 * Parse string JSON menjadi array field embed.
 * Format: [{"name":"Judul","value":"Isi","inline":true}, ...]
 * @param {string|null|undefined} raw
 * @returns {Array<{name:string,value:string,inline:boolean}>}
 */
function parseFields(raw) {
  if (!raw || !String(raw).trim()) {
    return [];
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error('Format JSON fields tidak valid. Contoh: [{"name":"Judul","value":"Isi","inline":true}]');
  }

  if (!Array.isArray(parsed)) {
    throw new Error('Fields harus berupa array JSON.');
  }
  if (parsed.length > MAX_FIELDS) {
    throw new Error(`Maksimal ${MAX_FIELDS} field (kamu mengirim ${parsed.length}).`);
  }

  return parsed.map((field, index) => {
    if (!field || typeof field.name !== 'string' || typeof field.value !== 'string') {
      throw new Error(`Field ke-${index + 1} harus punya "name" dan "value" berupa string.`);
    }
    if (field.name.length > 256) {
      throw new Error(`Nama field ke-${index + 1} melebihi 256 karakter.`);
    }
    if (field.value.length > 1024) {
      throw new Error(`Isi field ke-${index + 1} melebihi 1024 karakter.`);
    }
    return {
      name: field.name,
      value: field.value,
      inline: Boolean(field.inline),
    };
  });
}

/**
 * Parse teks multi-baris menjadi daftar tombol link.
 * Format tiap baris: "Label | https://url"
 * @param {string|null|undefined} raw
 * @returns {Array<{label:string,url:string}>}
 */
function parseLinks(raw) {
  if (!raw || !String(raw).trim()) {
    return [];
  }

  const lines = String(raw)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const links = lines.map((line) => {
    const idx = line.lastIndexOf('|');
    if (idx === -1) {
      throw new Error(`Baris "${line}" harus berformat "Label | https://url".`);
    }
    const label = line.slice(0, idx).trim();
    const url = line.slice(idx + 1).trim();

    if (!label) {
      throw new Error(`Label tombol kosong pada baris "${line}".`);
    }
    if (label.length > 80) {
      throw new Error(`Label "${label}" melebihi 80 karakter.`);
    }
    if (!/^https?:\/\/\S+$/i.test(url)) {
      throw new Error(`URL "${url}" tidak valid (harus diawali http:// atau https://).`);
    }
    return { label, url };
  });

  if (links.length > MAX_LINKS) {
    throw new Error(`Maksimal ${MAX_LINKS} tombol link (kamu mengirim ${links.length}).`);
  }

  return links;
}

/**
 * Ubah daftar link menjadi action rows berisi tombol link (maks 5 per baris).
 * @param {Array<{label:string,url:string}>} links
 * @returns {ActionRowBuilder[]}
 */
function buildLinkRows(links) {
  if (!links?.length) {
    return [];
  }
  const rows = [];
  for (let i = 0; i < links.length; i += 5) {
    const row = new ActionRowBuilder();
    for (const link of links.slice(i, i + 5)) {
      row.addComponents(
        new ButtonBuilder().setLabel(link.label).setURL(link.url).setStyle(ButtonStyle.Link)
      );
    }
    rows.push(row);
  }
  return rows;
}

/**
 * Cek apakah state masih kosong (tidak ada konten untuk dikirim).
 * @param {object} state
 * @returns {boolean}
 */
function isEmptyState(state) {
  return (
    !state.title &&
    !state.description &&
    !state.imageUrl &&
    !state.links?.length &&
    (!state.uploaded || state.uploaded.length === 0)
  );
}

/**
 * Rakit embed dari state.
 * @param {object} state
 * @returns {EmbedBuilder}
 */
function buildEmbedFromState(state) {
  const embed = new EmbedBuilder();
  embed.setColor(parseColor(state.color));

  if (state.title) embed.setTitle(state.title);
  if (state.description) embed.setDescription(state.description);
  if (state.url) embed.setURL(state.url);
  if (state.fields?.length) embed.addFields(state.fields);
  if (state.authorName) {
    embed.setAuthor({ name: state.authorName, iconURL: state.authorIcon || undefined });
  }
  if (state.footer) {
    embed.setFooter({ text: state.footer, iconURL: state.footerIcon || undefined });
  }
  if (state.thumbnail) embed.setThumbnail(state.thumbnail);
  if (state.imageUrl) embed.setImage(state.imageUrl);
  if (state.timestamp) embed.setTimestamp();

  return embed;
}

/**
 * Bersihkan nama file attachment agar aman dipakai di URL "attachment://".
 * Ekstensi (mis. .gif) tetap dipertahankan agar gambar bergerak tetap beranimasi.
 * @param {string|undefined} name
 * @returns {string}
 */
function safeAttachmentName(name) {
  const raw = (name || 'image.png').trim();
  const dot = raw.lastIndexOf('.');
  const base = (dot > 0 ? raw.slice(0, dot) : raw).replace(/[^A-Za-z0-9._-]+/g, '_').replace(/_+$/, '');
  const ext = dot > 0 ? raw.slice(dot).replace(/[^A-Za-z0-9.]+/g, '') : '';
  const cleaned = `${base || 'image'}${ext}`;
  return cleaned.slice(0, 100);
}

/**
 * Bentuk akhir embed + file + komponen tombol untuk dikirim ke channel.
 * File yang diupload via modal dikirim ulang sebagai attachment.
 * Mendukung gambar bergerak (GIF/WebP/APNG) baik dari upload maupun URL.
 * @param {object} state
 * @returns {{ embed: EmbedBuilder, files: AttachmentBuilder[], components: ActionRowBuilder[] }}
 */
function buildSendPayload(state) {
  const embed = buildEmbedFromState(state);
  const files = [];

  if (state.uploaded?.length) {
    const first = state.uploaded[0];
    const name = safeAttachmentName(first.name);
    embed.setImage(`attachment://${name}`);
    files.push(new AttachmentBuilder(first.url, { name }));
  }

  const components = buildLinkRows(state.links);

  return { embed, files, components };
}

module.exports = {
  parseColor,
  parseFields,
  parseLinks,
  buildLinkRows,
  safeAttachmentName,
  isEmptyState,
  buildEmbedFromState,
  buildSendPayload,
};