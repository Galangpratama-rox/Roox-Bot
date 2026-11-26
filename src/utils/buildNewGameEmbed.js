'use strict';

const { AttachmentBuilder, EmbedBuilder } = require('discord.js');
const seed = require('../data/newgame');
const config = require('../config');
const { safeAttachmentName } = require('./buildEmbed');

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

/**
 * Rakit embed pengumuman dari state.
 * @param {object} state
 * @param {{ includeUploaded?: boolean }} [options] includeUploaded true = thumbnail
 *   hasil upload dipakai lewat `attachment://` (harus disertai file-nya saat kirim).
 */
function buildNewGameEmbed(state, options = {}) {
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

  if (options.includeUploaded && state.thumbnailFile) {
    embed.setThumbnail(`attachment://${safeAttachmentName(state.thumbnailFile.name)}`);
  } else if (state.thumbnailUrl) {
    embed.setThumbnail(state.thumbnailUrl);
  }

  embed.setTimestamp();
  return embed;
}

/** File thumbnail yang diunggah lewat modal (dikirim ulang saat kirim). */
function buildNewGameFiles(state) {
  if (!state.thumbnailFile) return [];
  const name = safeAttachmentName(state.thumbnailFile.name);
  return [new AttachmentBuilder(state.thumbnailFile.url, { name })];
}

function buildNewGamePayload(state) {
  return {
    embeds: [buildNewGameEmbed(state, { includeUploaded: true })],
    files: buildNewGameFiles(state),
  };
}

module.exports = { buildNewGameEmbed, buildNewGameFiles, buildNewGamePayload, parseColor };
