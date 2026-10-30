'use strict';

const { PermissionFlagsBits } = require('discord.js');

const config = require('../config');
const store = require('./gameStore');
const { buildGamesEmbed } = require('../utils/buildGamesEmbed');

// Jeda minimal antar edit: cegah spam edit kalau owner menjalankan banyak command cepat.
const MIN_EDIT_INTERVAL_MS = 2000;
const REQUIRED_PERMS = [
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.SendMessages,
  PermissionFlagsBits.EmbedLinks,
];

let busy = false;
let pendingAgain = false;
let lastEditAt = 0;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchChannel(client, channelId) {
  if (!channelId) return null;
  const cached = client.channels.cache.get(channelId);
  if (cached) return cached;
  return client.channels.fetch(channelId).catch(() => null);
}

function missingPermissions(channel, client) {
  const me = channel.guild?.members?.me;
  if (!me) return [];
  const perms = channel.permissionsFor(me);
  if (!perms) return REQUIRED_PERMS.slice();
  return REQUIRED_PERMS.filter((perm) => !perms.has(perm));
}

/**
 * Apakah pesan ini panel yang kita kelola? Dipakai saat adopsi pesan pinned.
 * Dicocokkan lewat footer (fallback: author), bukan asal pesan bot.
 */
function isPanelMessage(message, client, media = store.getMedia()) {
  if (!message || message.author?.id !== client.user?.id) return false;
  const embed = message.embeds?.[0];
  if (!embed) return false;

  const footer = (embed.footer?.text || '').toLowerCase();
  const prefix = (media.footerPrefix || '').toLowerCase();
  if (prefix && footer.startsWith(prefix)) return true;

  const author = (embed.author?.name || '').toLowerCase();
  const authorName = (media.authorName || '').toLowerCase();
  return Boolean(authorName && author === authorName);
}

async function updateOnce(client, options) {
  const state = store.getState();
  const panel = state.panel;

  if (!panel?.channelId) {
    return { ok: false, reason: 'panel belum diset. Jalankan `/games panel` dulu.' };
  }

  const { embed, hash } = buildGamesEmbed(state);

  if (!options.force && panel.messageId && store.getLastHash() === hash) {
    return { ok: true, skipped: true, messageId: panel.messageId, channelId: panel.channelId };
  }

  const channel = await fetchChannel(client, panel.channelId);
  if (!channel || !channel.isTextBased() || !channel.guild) {
    return { ok: false, reason: `channel <#${panel.channelId}> tidak bisa diakses.` };
  }

  const missing = missingPermissions(channel, client);
  if (missing.length) {
    return { ok: false, reason: `bot tidak punya izin di ${channel} (${missing.join(', ')}).` };
  }

  const payload = { embeds: [embed] };

  if (panel.messageId) {
    const existing = await channel.messages.fetch(panel.messageId).catch(() => null);

    if (existing && existing.author.id !== client.user.id) {
      return { ok: false, reason: `pesan ${panel.messageId} bukan milik bot.` };
    }

    if (existing) {
      const wait = MIN_EDIT_INTERVAL_MS - (Date.now() - lastEditAt);
      if (wait > 0) await sleep(wait);
      await existing.edit(payload);
      lastEditAt = Date.now();
      store.setLastHash(hash);
      store.updatePanel({}, Date.now());
      return { ok: true, messageId: existing.id, channelId: channel.id, edited: true };
    }
    // Pesan panel sudah dihapus -> kirim ulang & simpan id baru.
  }

  const sent = await channel.send(payload);
  lastEditAt = Date.now();
  store.updatePanel({ guildId: channel.guild.id, channelId: channel.id, messageId: sent.id }, Date.now());
  store.setLastHash(hash);
  await sent.pin().catch(() => {});

  return { ok: true, messageId: sent.id, channelId: channel.id, created: true };
}

/**
 * Render + edit pesan panel. Aman dipanggil berkali-kali: panggilan yang
 * datang saat proses berjalan akan digabung jadi satu update tambahan.
 * @param {import('discord.js').Client} client
 * @param {{ force?: boolean }} [options]
 */
async function renderAndUpdate(client, options = {}) {
  if (busy) {
    pendingAgain = true;
    return { ok: true, queued: true };
  }

  busy = true;
  try {
    let result = await updateOnce(client, options);
    while (pendingAgain) {
      pendingAgain = false;
      result = await updateOnce(client, { force: false });
    }
    return result;
  } catch (err) {
    console.error('[games] gagal memperbarui panel:', err);
    return { ok: false, reason: err.message };
  } finally {
    busy = false;
  }
}

/**
 * Ambil daftar pesan yang di-pin, dengan dukungan `fetchPins()` (baru) dan
 * `fetchPinned()` (lama). Mengembalikan array pesan, atau null kalau gagal.
 * @param {import('discord.js').TextBasedChannel} channel
 */
async function fetchPinnedMessages(channel) {
  const manager = channel.messages;

  if (typeof manager?.fetchPins === 'function') {
    const result = await manager.fetchPins({ limit: 50 }).catch(() => null);
    if (!result) return null;
    return (result.items || []).map((pin) => pin.message ?? pin).filter(Boolean);
  }

  if (typeof manager?.fetchPinned === 'function') {
    const pins = await manager.fetchPinned().catch(() => null);
    return pins ? [...pins.values()] : null;
  }

  return null;
}

/**
 * Cari panel yang sudah ada di pesan pinned channel, lalu simpan id-nya.
 * Dipakai saat state.json hilang (redeploy) atau saat panel perlu dipulihkan.
 * @param {import('discord.js').Client} client
 * @param {string} channelId
 */
async function adoptPinned(client, channelId) {
  const channel = await fetchChannel(client, channelId);
  if (!channel || !channel.isTextBased() || !channel.guild) {
    return { ok: false, reason: 'channel tidak valid / bot tidak bisa mengakses.' };
  }

  const pins = await fetchPinnedMessages(channel);
  if (!pins) {
    return { ok: false, reason: 'tidak bisa membaca pesan pinned (butuh izin Read Message History).' };
  }

  const media = store.getMedia();
  const match = pins.find((message) => isPanelMessage(message, client, media));
  if (!match) return { ok: false, reason: 'panel tidak ditemukan di pesan pinned.' };

  store.updatePanel({ guildId: channel.guild.id, channelId: channel.id, messageId: match.id });
  return { ok: true, messageId: match.id, channelId: channel.id };
}

/**
 * Dipanggil sekali saat bot ready: pulihkan panel (adopsi pinned bila perlu)
 * lalu render ulang supaya isi pesan selalu sinkron dengan state.
 * @param {import('discord.js').Client} client
 */
async function bootstrap(client) {
  const state = store.getState();

  if (!state.panel.messageId) {
    const channelId = state.panel.channelId || config.gamesChannelId;
    if (!channelId) {
      console.log('[games] panel belum diset. Jalankan `/games panel` di channel tujuan.');
      return;
    }
    const adopted = await adoptPinned(client, channelId);
    if (!adopted.ok) {
      console.log(`[games] panel belum ada (${adopted.reason}) Jalankan \`/games panel\`.`);
      return;
    }
    console.log(`[games] panel diadopsi dari pesan pinned ${adopted.messageId}.`);
  }

  const result = await renderAndUpdate(client, { force: true });
  if (result.ok) {
    console.log(`[games] panel siap (pesan ${result.messageId}).`);
  } else {
    console.warn(`[games] bootstrap panel gagal: ${result.reason}`);
  }
}

module.exports = { renderAndUpdate, adoptPinned, bootstrap, isPanelMessage };
