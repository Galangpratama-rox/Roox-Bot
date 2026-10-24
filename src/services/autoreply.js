'use strict';

const config = require('../config');
const faq = require('../data/faq');
const gemini = require('./gemini');
const { isOnCooldown } = require('../utils/cooldown');
const { buildEmbedFromState, buildLinkRows } = require('../utils/buildEmbed');

const DISCORD_MAX_CONTENT = 2000;

function mention(id, label) {
  return id ? `<#${id}>` : `#${label}`;
}

/**
 * Ganti token {get-key} / {get-script} / {support-game} / {support-executor}
 * dengan mention channel.
 */
function resolveTokens(text) {
  if (typeof text !== 'string') return text;
  return text
    .replaceAll('{get-key}', mention(config.autoReply.channelGetKey, 'get-key'))
    .replaceAll('{get-script}', mention(config.autoReply.channelGetScript, 'get-script'))
    .replaceAll('{support-game}', mention(config.autoReply.channelSupportGame, 'support-game'))
    .replaceAll(
      '{support-executor}',
      mention(config.autoReply.channelSupportExecutor, 'support-executor')
    );
}

function truncate(text, max = DISCORD_MAX_CONTENT) {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 3)}...`;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Cocokkan salah satu frasa dari daftar (kata tunggal pakai word-boundary). */
function hasAnyPhrase(text, list) {
  const lower = text.toLowerCase();
  return (list || []).some((phrase) => {
    const p = String(phrase).toLowerCase();
    if (/^[a-z0-9]+$/.test(p)) {
      return new RegExp(`\\b${escapeRegExp(p)}\\b`, 'i').test(lower);
    }
    return lower.includes(p);
  });
}

function hasTopicKeyword(text) {
  return hasAnyPhrase(text, faq.triggerKeywords);
}

function isTrigger(text) {
  if (!hasTopicKeyword(text)) return false;

  // Harus benar-benar berniat nyari sumber (bukan cuma nyebut sc/key).
  if (!hasAnyPhrase(text, faq.sourceIntent)) return false;

  // Kalau cuma ngobrol soal sc/key (kapan/kenapa/fix/error...) & gak nanya lokasi -> diam.
  const negative = hasAnyPhrase(text, faq.negativeWords);
  if (negative && !hasAnyPhrase(text, faq.strongIntent)) return false;

  return true;
}

function matchesAny(text, patterns) {
  return (patterns || []).some((pattern) => pattern.test(text));
}

function findCanned(text, channelId) {
  const channelEntry = faq.channelEntries?.[channelId];
  if (channelEntry && matchesAny(text, channelEntry.patterns)) {
    return channelEntry.answer;
  }
  for (const entry of faq.entries) {
    if (matchesAny(text, entry.patterns)) {
      return entry.answer;
    }
  }
  return null;
}

function isSkip(answer) {
  return /^skip\b/i.test(answer.trim());
}

/** Ubah jawaban (string atau objek embed) menjadi payload pesan Discord. */
function answerToPayload(answer) {
  if (typeof answer === 'string') {
    return { content: truncate(resolveTokens(answer)) };
  }

  const normalized = {
    title: resolveTokens(answer.title),
    description: resolveTokens(answer.description),
    url: answer.url,
    color: answer.color,
    fields: (answer.fields || []).map((field) => ({
      name: field.name,
      value: resolveTokens(field.value),
      inline: Boolean(field.inline),
    })),
    authorName: answer.authorName,
    authorIcon: answer.authorIcon,
    footer: resolveTokens(answer.footer),
    footerIcon: answer.footerIcon,
    thumbnail: answer.thumbnail,
    imageUrl: answer.imageUrl || answer.image,
    timestamp: answer.timestamp,
  };

  const embed = buildEmbedFromState(normalized);
  const components = buildLinkRows(answer.links);
  return { embeds: [embed], components };
}

async function safeReply(message, answer) {
  try {
    await message.reply(answerToPayload(answer));
  } catch (err) {
    console.error('[autoreply] Gagal mengirim balasan:', err.message);
  }
}

/**
 * Handler utama auto-reply untuk satu pesan.
 * @param {import('discord.js').Message} message
 */
async function handleMessage(message) {
  try {
    const cfg = config.autoReply;
    if (!cfg.enabled) return;
    if (!message.inGuild()) return;
    if (message.author.bot || message.webhookId) return;
    if (cfg.channels.length && !cfg.channels.includes(message.channelId)) return;

    const content = (message.content || '').trim();
    if (!content) return;
    if (!isTrigger(content)) return;

    if (isOnCooldown(`u:${message.author.id}`, cfg.cooldownMs)) return;
    if (isOnCooldown(`c:${message.channelId}`, cfg.cooldownMs)) return;

    const canned = findCanned(content, message.channelId);
    if (canned) {
      return safeReply(message, canned);
    }

    if (!cfg.geminiApiKey) {
      return safeReply(message, faq.fallback);
    }

    let answer;
    try {
      answer = await gemini.generate({
        apiKey: cfg.geminiApiKey,
        model: cfg.geminiModel,
        systemPrompt: resolveTokens(faq.systemPrompt),
        userText: content.slice(0, cfg.maxLen),
      });
    } catch (err) {
      console.error('[autoreply] Gemini gagal:', err.message);
      return safeReply(message, faq.fallback);
    }

    if (!answer || isSkip(answer)) return;

    return safeReply(message, answer);
  } catch (err) {
    console.error('[autoreply] Error tak terduga:', err);
  }
}

module.exports = { handleMessage, isTrigger, findCanned, answerToPayload };
