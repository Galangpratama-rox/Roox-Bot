'use strict';

const { AttachmentBuilder, PermissionFlagsBits } = require('discord.js');

const config = require('../config');
const panelStore = require('./panelStore');
const assets = require('./assetStore');
const { buildGamesEmbed } = require('../utils/buildGamesEmbed');
const { buildTextEmbed } = require('../utils/buildTextEmbed');

// Jeda minimal antar edit: cegah spam edit kalau owner menjalankan banyak command cepat.
const MIN_EDIT_INTERVAL_MS = 2000;
const REQUIRED_PERMS = [
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.SendMessages,
  PermissionFlagsBits.EmbedLinks,
];

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

// Nama file aset diberi tag jenis, jadi jenisnya bisa dikenali dari lampiran pesan.
const TAG_TO_MEDIA_KEY = {
  thumbnail: 'thumbnailFile',
  banner: 'bannerFile',
  authoricon: 'authorIconFile',
  footericon: 'footerIconFile',
};

/**
 * Pulihkan data media dari nama lampiran pesan panel. Berguna saat state.json
 * hilang (redeploy) padahal gambarnya masih menempel di pesan.
 * @param {import('discord.js').Message|null} existing
 */
function recoverMediaFromMessage(existing) {
  const patch = {};
  for (const attachment of existing?.attachments?.values?.() ?? []) {
    const match = /^(thumbnail|banner|authoricon|footericon)-/i.exec(attachment.name || '');
    if (!match) continue;
    patch[TAG_TO_MEDIA_KEY[match[1].toLowerCase()]] = attachment.name;
  }
  return patch;
}

/** Teks footer yang jadi "tanda tangan" sebuah panel (untuk adopsi pesan pinned). */
function footerSignature(media) {
  return String(media?.footerPrefix || media?.footerText || media?.authorName || '').trim();
}

function isPanelMessageFor(key, message, client) {
  if (!message || message.author?.id !== client.user?.id) return false;
  const embed = message.embeds?.[0];
  if (!embed) return false;

  const media = panelStore.getMedia(key) || {};
  const signature = footerSignature(media).toLowerCase();
  const footer = (embed.footer?.text || '').toLowerCase();
  if (signature && footer.startsWith(signature)) return true;

  // Fallback (kalau footer dikosongkan): author + judul harus sama-sama cocok,
  // supaya panel lain di channel yang sama tidak salah diadopsi.
  const author = (embed.author?.name || '').toLowerCase();
  const authorName = (media.authorName || '').toLowerCase();
  const title = (embed.title || '').toLowerCase();
  const expectedTitle = (media.title || '').toLowerCase();
  return Boolean(authorName && author === authorName && expectedTitle && title === expectedTitle);
}

/**
 * Buat pengelola panel live untuk satu panel.
 * @param {{ key: string, buildEmbed: Function, defaultChannelId?: string|null }} options
 */
function createPanelUpdater({ key, buildEmbed, defaultChannelId = null }) {
  let busy = false;
  let pendingAgain = false;
  let lastEditAt = 0;

  /**
   * Nama lampiran yang dianggap sudah menempel di pesan panel: gabungan catatan
   * state, lampiran yang dilaporkan pesan, dan file yang direferensikan embed.
   *
   * Penting: Discord MENGHAPUS lampiran yang dipakai embed dari
   * `message.attachments`, jadi nama file aset juga dibaca dari URL gambar/ikon
   * embed yang sudah ada di pesan.
   */
  function knownAttachmentNames(panel, existing) {
    const names = new Set(Array.isArray(panel?.attachments) ? panel.attachments : []);

    for (const attachment of existing?.attachments?.values?.() ?? []) {
      names.add(attachment.name);
    }

    const embed = existing?.embeds?.[0];
    const urls = [
      embed?.image?.url,
      embed?.thumbnail?.url,
      embed?.author?.iconURL,
      embed?.footer?.iconURL,
    ];

    for (const url of urls) {
      if (!url) continue;
      const fileName = url.startsWith('attachment://')
        ? url.slice('attachment://'.length)
        : url.split('?')[0].split('/').pop();
      if (fileName) names.add(fileName);
    }

    return names;
  }

  /**
   * Susun gambar yang perlu diunggah.
   *
   * - Mode GANTI: semua gambar ada di disk -> lampiran pesan diganti utuh.
   * - Mode TAMBAH: ada gambar hanya menempel di pesan (tidak ada di disk, mis.
   *   setelah redeploy) -> jangan ganti lampiran, cuma tambahkan yang baru.
   */
  function planAssets(referenced, known) {
    const onDisk = new Set(referenced.filter((fileName) => assets.exists(fileName)));
    const awaitingUpload = referenced.filter(
      (fileName) => !known.has(fileName) || !onDisk.has(fileName)
    );
    const replaceMode =
      awaitingUpload.length > 0 && referenced.every((fileName) => onDisk.has(fileName));

    const files = [];
    if (awaitingUpload.length) {
      const list = replaceMode
        ? referenced
        : referenced.filter((fileName) => !known.has(fileName) && onDisk.has(fileName));

      for (const fileName of list) {
        const buffer = assets.read(fileName);
        if (buffer) files.push(new AttachmentBuilder(buffer, { name: fileName }));
      }
    }

    const unavailable = referenced.filter(
      (fileName) => !known.has(fileName) && !onDisk.has(fileName)
    );
    if (unavailable.length) {
      console.warn(
        `[panel:${key}] gambar tidak tersedia di pesan maupun di ${assets.assetDir()} ` +
          `(${unavailable.join(', ')}). Upload ulang lewat \`/panel media\`.`
      );
    }

    return { files, replace: replaceMode && files.length > 0 };
  }

  async function updateOnce(client, options = {}) {
    const data = panelStore.getPanelData(key);
    if (!data) return { ok: false, reason: `panel "${key}" tidak ditemukan.` };

    const panel = data.panel;
    if (!panel?.channelId) {
      return { ok: false, reason: 'panel belum diset. Kirim dulu panelnya ke channel.' };
    }

    const channel = await fetchChannel(client, panel.channelId);
    if (!channel || !channel.isTextBased() || !channel.guild) {
      return { ok: false, reason: `channel <#${panel.channelId}> tidak bisa diakses.` };
    }

    const perms = missingPermissions(channel, client);
    if (perms.length) {
      return { ok: false, reason: `bot tidak punya izin di ${channel} (${perms.join(', ')}).` };
    }

    let existing = null;
    if (panel.messageId) {
      existing = await channel.messages.fetch(panel.messageId).catch(() => null);
      if (existing && existing.author.id !== client.user.id) {
        return { ok: false, reason: `pesan ${panel.messageId} bukan milik bot.` };
      }
    }

    let media = data.media || {};

    // State bisa hilang karena redeploy, padahal gambarnya masih di pesan.
    if (existing && panelStore.IMAGE_KINDS.every((kind) => !media[`${kind}File`])) {
      const recovered = recoverMediaFromMessage(existing);
      if (Object.keys(recovered).length) {
        media = panelStore.setMedia(key, recovered);
        console.log(
          `[panel:${key}] media dipulihkan dari lampiran pesan: ${Object.values(recovered).join(', ')}`
        );
      }
    }

    const referenced = [
      ...new Set(panelStore.IMAGE_KINDS.map((kind) => media[`${kind}File`]).filter(Boolean)),
    ];
    const known = knownAttachmentNames(panel, existing);
    const { files, replace } = planAssets(referenced, known);

    const usable = new Set(
      referenced.filter((fileName) => known.has(fileName) || assets.exists(fileName))
    );
    const resolveImage = (kind) => {
      const fileName = media[`${kind}File`];
      if (!fileName) return media[kind] || null;
      return usable.has(fileName) ? `attachment://${fileName}` : null;
    };

    const built = buildEmbed(panelStore.getPanelData(key), { resolveImage, key });
    const { embed, hash, components } = built;

    if (!options.force && !files.length && existing && panelStore.getLastHash(key) === hash) {
      return { ok: true, skipped: true, messageId: existing.id, channelId: channel.id };
    }

    const payload = { embeds: [embed] };
    if (Array.isArray(components)) payload.components = components;

    if (replace) {
      payload.files = files;
      // Lampiran lama diganti set baru supaya tidak menumpuk.
      payload.attachments = [];
    } else if (files.length) {
      // Tidak bisa ganti total: tambahkan saja, gambar lama tetap aman.
      payload.files = files;
    }

    const uploadedNames = files.map((file) => file.name);
    const nextAttachments = replace
      ? uploadedNames
      : [...new Set([...(panel.attachments || []), ...uploadedNames, ...known])].filter((name) =>
          referenced.includes(name)
        );

    if (existing) {
      const wait = MIN_EDIT_INTERVAL_MS - (Date.now() - lastEditAt);
      if (wait > 0) await sleep(wait);
      await existing.edit(payload);
      lastEditAt = Date.now();
      panelStore.setLastHash(key, hash);
      panelStore.updatePanel(key, { attachments: nextAttachments }, Date.now());
      return { ok: true, messageId: existing.id, channelId: channel.id, edited: true };
    }

    const sent = await channel.send(payload);
    lastEditAt = Date.now();
    panelStore.updatePanel(
      key,
      {
        guildId: channel.guild.id,
        channelId: channel.id,
        messageId: sent.id,
        attachments: nextAttachments,
      },
      Date.now()
    );
    panelStore.setLastHash(key, hash);
    await sent.pin().catch(() => {});

    return { ok: true, messageId: sent.id, channelId: channel.id, created: true };
  }

  /**
   * Render + edit pesan panel. Panggilan yang datang saat proses berjalan
   * digabung jadi satu update tambahan.
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
      console.error(`[panel:${key}] gagal memperbarui panel:`, err);
      return { ok: false, reason: err.message };
    } finally {
      busy = false;
    }
  }

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

  async function adoptPinned(client, channelId) {
    const target = channelId || panelStore.getPanel(key)?.channelId || defaultChannelId;
    const channel = await fetchChannel(client, target);
    if (!channel || !channel.isTextBased() || !channel.guild) {
      return { ok: false, reason: 'channel tidak valid / bot tidak bisa mengakses.' };
    }

    const pins = await fetchPinnedMessages(channel);
    if (!pins) {
      return { ok: false, reason: 'tidak bisa membaca pesan pinned (butuh izin Read Message History).' };
    }

    const match = pins.find((message) => isPanelMessageFor(key, message, client));
    if (!match) return { ok: false, reason: 'panel tidak ditemukan di pesan pinned.' };

    panelStore.updatePanel(key, { guildId: channel.guild.id, channelId: channel.id, messageId: match.id });
    return { ok: true, messageId: match.id, channelId: channel.id };
  }

  async function bootstrap(client) {
    const panel = panelStore.getPanel(key);
    if (!panel) return { ok: false, reason: 'panel tidak ditemukan.' };

    if (!panel.messageId) {
      const channelId = panel.channelId || defaultChannelId;
      if (!channelId) {
        console.log(`[panel:${key}] belum ada posisi. Kirim panelnya lewat command panel.`);
        return { ok: false, reason: 'belum ada posisi.' };
      }
      const adopted = await adoptPinned(client, channelId);
      if (!adopted.ok) {
        console.log(`[panel:${key}] panel belum ada (${adopted.reason})`);
        return { ok: false, reason: adopted.reason };
      }
      console.log(`[panel:${key}] panel diadopsi dari pesan pinned ${adopted.messageId}.`);
    }

    const result = await renderAndUpdate(client, { force: true });
    if (result.ok) {
      console.log(`[panel:${key}] panel siap (pesan ${result.messageId}).`);
    } else {
      console.warn(`[panel:${key}] bootstrap gagal: ${result.reason}`);
    }
    return result;
  }

  return {
    key,
    updateOnce,
    renderAndUpdate,
    adoptPinned,
    bootstrap,
    isPanelMessage: (message, client) => isPanelMessageFor(key, message, client),
  };
}

// ---------------------------------------------------------------------------
// Registry panel
// ---------------------------------------------------------------------------
const instances = new Map();

function createUpdaterFor(key) {
  const data = panelStore.getPanelData(key);
  const type = data?.type === 'games' ? 'games' : 'text';

  const buildEmbed =
    type === 'games'
      ? buildGamesEmbed
      : (panelData, options = {}) => buildTextEmbed(panelData, { ...options, key });

  const updater = createPanelUpdater({
    key,
    buildEmbed,
    defaultChannelId: config.panelChannels?.[key] ?? null,
  });

  instances.set(key, updater);
  return updater;
}

function getUpdater(key) {
  return instances.get(key) ?? createUpdaterFor(key);
}

async function bootstrapAll(client) {
  panelStore.init();
  for (const key of panelStore.listPanels()) {
    try {
      await getUpdater(key).bootstrap(client);
    } catch (err) {
      console.error(`[panel:${key}] bootstrap error:`, err);
    }
  }
}

module.exports = {
  createPanelUpdater,
  getUpdater,
  bootstrapAll,
  isPanelMessageFor,
  footerSignature,
  recoverMediaFromMessage,
  ...getUpdater('games'),
};
