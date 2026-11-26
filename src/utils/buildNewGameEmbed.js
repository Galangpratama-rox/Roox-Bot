'use strict';

const { EmbedBuilder } = require('discord.js');
const seed = require('../data/newgame');
const config = require('../config');

// Batas Discord: value field max 1024, title max 256.
const FIELD_VALUE_LIMIT = 1024;
const TITLE_LIMIT = 256;

/** '#RRGGBB' -> integer warna (fallback: config.embedColor). */
function parseColor(hex) {
  const clean = String(hex || '')
    .trim()
    .replace(/^#/, '');
  if (/^[0-9a-fA-F]{6}$/.test(clean)) return parseInt(clean, 16);
  return parseInt(String(config.embedColor || '#5865F2').replace('#', ''), 16);
}

function clamp(text, limit) {
  const str = String(text);
  return str.length <= limit ? str : `${str.slice(0, limit - 1)}…`;
}

function codeBlock(language, body) {
  return `\`\`\`${language || ''}\n${body}\n\`\`\``;
}

/** Setiap fitur jadi satu baris "+ Fitur" (baris yang sudah diawali +/- dibiarkan). */
function featureLines(features = []) {
  return features
    .map((line) => String(line).trim())
    .filter(Boolean)
    .map((line) => (/^[+-]\s?/.test(line) ? line : `+ ${line}`));
}

function buildFeaturesValue(features = []) {
  const lines = featureLines(features);
  const body = lines.length ? lines.join('\n') : '_Belum ada fitur._';
  return clamp(codeBlock(seed.featuresLanguage, body), FIELD_VALUE_LIMIT);
}

function buildChannelLines(state) {
  const lines = [];
  if (state.keyChannelId) lines.push(seed.keyLine.replace('{channel}', `<#${state.keyChannelId}>`));
  if (state.loaderChannelId) {
    lines.push(seed.loaderLine.replace('{channel}', `<#${state.loaderChannelId}>`));
  }
  return lines.join('\n');
}

function buildScriptValue(state) {
  const script = String(state.script || '').trim();
  const block = codeBlock(seed.scriptLanguage, script);
  const channels = buildChannelLines(state);
  return clamp(channels ? `${block}\n\n${channels}` : block, FIELD_VALUE_LIMIT);
}

function descriptionOf(state) {
  if (state.description) return state.description;
  if (!state.gameName) return null;
  return seed.descriptionTemplate.replace(/\{name\}/g, state.gameName);
}

function thumbnailOf(state) {
  if (state.thumbnailFile?.url) return state.thumbnailFile.url;
  if (state.thumbnailUrl) return state.thumbnailUrl;
  return null;
}

/**
 * Rakit embed pengumuman dari state.
 * @param {object} state
 */
function buildNewGameEmbed(state) {
  const embed = new EmbedBuilder();
  embed.setColor(parseColor(state.color ?? seed.color));

  if (seed.authorName || seed.authorIcon) {
    embed.setAuthor({ name: seed.authorName || 'Hub', iconURL: seed.authorIcon || undefined });
  }

  const gameName = String(state.gameName || '').trim() || 'Game';
  embed.setTitle(`${seed.titlePrefix}: ${gameName}`.slice(0, TITLE_LIMIT));

  const description = descriptionOf(state);
  if (description) embed.setDescription(description);

  embed.addFields({
    name: seed.featuresHeading.slice(0, TITLE_LIMIT),
    value: buildFeaturesValue(state.features),
    inline: false,
  });
  embed.addFields({
    name: seed.scriptHeading.slice(0, TITLE_LIMIT),
    value: buildScriptValue(state),
    inline: false,
  });

  const thumbnail = thumbnailOf(state);
  if (thumbnail) embed.setThumbnail(thumbnail);

  embed.setTimestamp();
  return embed;
}

/** Payload kirim: embed saja (thumbnail pakai URL, tidak ada attachment). */
function buildNewGamePayload(state) {
  return { embeds: [buildNewGameEmbed(state)], files: [] };
}

// ---------------------------------------------------------------------------
// Kebalikannya: bangun ulang state dari embed preview.
// Dipakai kalau sesi hilang dari memori & disk (mis. setelah redeploy):
// selama pesan panel masih ada, sesi bisa dilanjutkan.
// ---------------------------------------------------------------------------
function stripFence(value) {
  const match = String(value || '').match(/```[a-zA-Z0-9]*\n?([\s\S]*?)```/);
  return match ? match[1].replace(/\n$/, '') : null;
}

function parseFeatures(value) {
  const inner = stripFence(value);
  if (inner == null) return [];
  return inner
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/^[+-]\s?/, '').trim())
    .filter(Boolean);
}

function parseScript(value) {
  const text = String(value || '');
  const inner = stripFence(text);
  const script = inner == null ? '' : inner.trim();

  let keyChannelId = null;
  let loaderChannelId = null;
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/<#(\d+)>/);
    if (!match) continue;
    if (/key/i.test(line)) keyChannelId = match[1];
    else if (/loader/i.test(line)) loaderChannelId = match[1];
  }

  return { script, keyChannelId, loaderChannelId };
}

/**
 * @param {object} embed instance/APIEmbed dari `interaction.message.embeds[0]`
 * @param {{ pid: string, ownerId: string }} meta
 * @returns {object|null} state yang siap dipakai, atau null kalau bukan embed /newgame
 */
function stateFromEmbed(embed, { pid, ownerId }) {
  if (!embed || typeof embed !== 'object') return null;

  const title = String(embed.title || '');
  const prefix = `${seed.titlePrefix}: `;
  const gameName = title.startsWith(prefix) ? title.slice(prefix.length) : title;

  const fields = Array.isArray(embed.fields) ? embed.fields : [];
  const featuresField = fields.find((field) => field.name === seed.featuresHeading);
  const scriptField = fields.find((field) => field.name === seed.scriptHeading);
  const { script, keyChannelId, loaderChannelId } = parseScript(scriptField?.value);

  const color = Number.isInteger(embed.color)
    ? `#${embed.color.toString(16).padStart(6, '0')}`
    : null;

  return {
    pid,
    ownerId,
    createdAt: Date.now(),
    gameName,
    description: embed.description || null,
    color,
    thumbnailUrl: embed.thumbnail?.url || null,
    thumbnailFile: null,
    features: parseFeatures(featuresField?.value),
    script,
    keyChannelId,
    loaderChannelId,
    targetChannelId: null,
  };
}

module.exports = {
  buildNewGameEmbed,
  buildNewGamePayload,
  parseColor,
  stateFromEmbed,
};
