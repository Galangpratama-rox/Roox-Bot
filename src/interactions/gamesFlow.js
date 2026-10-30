'use strict';

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  FileUploadBuilder,
  LabelBuilder,
  MessageFlags,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');

const seed = require('../data/games');
const store = require('../services/gameStore');
const assets = require('../services/assetStore');
const { renderAndUpdate } = require('../services/panelUpdater');

function textInput(customId, value, { paragraph = false, maxLength = 400 } = {}) {
  const input = new TextInputBuilder()
    .setCustomId(customId)
    .setStyle(paragraph ? TextInputStyle.Paragraph : TextInputStyle.Short)
    .setRequired(false)
    .setMaxLength(maxLength);
  if (value) input.setValue(String(value).slice(0, maxLength));
  return input;
}

function fileInput(customId) {
  return new FileUploadBuilder()
    .setCustomId(customId)
    .setMinValues(0)
    .setMaxValues(1)
    .setRequired(false);
}

function clean(value) {
  const trimmed = String(value ?? '').trim();
  return trimmed.length ? trimmed : null;
}

async function replyEphemeral(interaction, content) {
  const payload = { content, flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } };
  if (interaction.deferred || interaction.replied) {
    return interaction.editReply({ content, allowedMentions: { parse: [] } }).catch(() => {});
  }
  return interaction.reply(payload).catch(() => {});
}

/**
 * Simpan file yang diunggah lewat modal ke folder data/assets.
 * @param {string} tag jenis gambar (thumbnail/banner/authoricon/footericon)
 * @returns {Promise<string|undefined>} nama file, atau undefined kalau tidak ada upload
 */
async function pickUpload(fields, customId, tag) {
  const uploaded = fields.getUploadedFiles(customId);
  if (!uploaded || uploaded.size === 0) return undefined;

  const attachment = [...uploaded.values()][0];
  if (!assets.isAllowedFile(attachment.name)) {
    throw new Error(
      `File "${attachment.name}" tidak didukung. Pakai PNG, JPG, WEBP, atau GIF.`
    );
  }

  const buffer = await assets.download(attachment.url);
  return assets.saveUpload(buffer, attachment.name, tag);
}

/**
 * Salin gambar yang sudah menempel di pesan panel ke disk. Perlu dilakukan
 * sebelum mengganti media, karena lampiran pesan akan diganti dengan set baru.
 */
async function cacheMessageAssets(interaction, media) {
  const panel = store.getPanel();
  if (!panel?.channelId || !panel?.messageId) return;

  const channel = await interaction.client.channels.fetch(panel.channelId).catch(() => null);
  if (!channel?.messages) return;

  const message = await channel.messages.fetch(panel.messageId).catch(() => null);
  if (!message) return;

  const byName = new Map([...message.attachments.values()].map((att) => [att.name, att]));
  for (const kind of seed.imageKinds) {
    const fileName = media[`${kind}File`];
    if (!fileName || assets.exists(fileName)) continue;

    const attachment = byName.get(fileName);
    if (!attachment) continue;

    try {
      assets.write(fileName, await assets.download(attachment.url));
    } catch (err) {
      console.warn(`[games] gagal menyalin aset ${fileName}: ${err.message}`);
    }
  }
}

function referencedFiles(media) {
  return seed.imageKinds.map((kind) => media[`${kind}File`]).filter(Boolean);
}

// ---------------------------------------------------------------------------
// Modal: media (thumbnail kanan atas, banner gif, author, judul)
// ---------------------------------------------------------------------------
function openMediaModal(interaction) {
  store.init();
  const media = store.getMedia();

  const modal = new ModalBuilder().setCustomId('games:media:submit').setTitle('Media & Judul Panel');
  modal.addLabelComponents(
    new LabelBuilder()
      .setLabel('Thumbnail')
      .setDescription('Gambar kecil di kanan atas — upload PNG/JPG/GIF')
      .setFileUploadComponent(fileInput('thumbnail')),
    new LabelBuilder()
      .setLabel('Banner')
      .setDescription('Gambar besar di bawah — boleh GIF animasi')
      .setFileUploadComponent(fileInput('banner')),
    new LabelBuilder()
      .setLabel('Author Name')
      .setDescription('Teks kecil di atas judul')
      .setTextInputComponent(textInput('author_name', media.authorName, { maxLength: 100 })),
    new LabelBuilder()
      .setLabel('Author Icon')
      .setDescription('Ikon di samping author name')
      .setFileUploadComponent(fileInput('author_icon')),
    new LabelBuilder()
      .setLabel('Title')
      .setDescription('Judul besar embed')
      .setTextInputComponent(textInput('title', media.title, { maxLength: 256 }))
  );

  return interaction.showModal(modal);
}

function openFooterModal(interaction) {
  store.init();
  const media = store.getMedia();

  const modal = new ModalBuilder().setCustomId('games:footer:submit').setTitle('Footer Panel');
  modal.addLabelComponents(
    new LabelBuilder()
      .setLabel('Footer Text')
      .setDescription('Contoh: Roox Hub · Supported Games')
      .setTextInputComponent(textInput('footer_prefix', media.footerPrefix, { maxLength: 200 })),
    new LabelBuilder()
      .setLabel('Footer Icon')
      .setDescription('Ikon kecil di footer — upload PNG/JPG/GIF')
      .setFileUploadComponent(fileInput('footer_icon'))
  );

  return interaction.showModal(modal);
}

// ---------------------------------------------------------------------------
// Modal submit
// ---------------------------------------------------------------------------
async function handleGamesModal(interaction) {
  store.init();
  const scope = interaction.customId.split(':')[1];
  const fields = interaction.fields;

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  let patch;
  try {
    if (scope === 'media') {
      patch = {
        thumbnailFile: await pickUpload(fields, 'thumbnail', 'thumbnail'),
        bannerFile: await pickUpload(fields, 'banner', 'banner'),
        authorName: clean(fields.getTextInputValue('author_name')),
        authorIconFile: await pickUpload(fields, 'author_icon', 'authoricon'),
        title: clean(fields.getTextInputValue('title')),
      };
    } else if (scope === 'footer') {
      patch = {
        footerPrefix: clean(fields.getTextInputValue('footer_prefix')),
        footerIconFile: await pickUpload(fields, 'footer_icon', 'footericon'),
      };
    } else {
      return interaction.editReply({ content: 'Jenis modal tidak dikenal.' });
    }
  } catch (err) {
    return interaction.editReply({ content: `❌ ${err.message}` });
  }

  // Buang nilai undefined: hanya field yang benar-benar diisi yang berubah.
  for (const key of Object.keys(patch)) {
    if (patch[key] === undefined) delete patch[key];
  }

  const uploaded = Object.keys(patch).length > 0;
  if (!uploaded) {
    return interaction.editReply({ content: 'ℹ️ Tidak ada perubahan yang dikirim.' });
  }

  await cacheMessageAssets(interaction, store.getMedia());
  const media = store.setMedia(patch);
  assets.prune(referencedFiles(media));

  const result = await renderAndUpdate(interaction.client, { force: true });
  const head = scope === 'media' ? '✅ Media & judul panel disimpan.' : '✅ Footer panel disimpan.';
  const tail = result.ok
    ? `\nPanel sudah di-update${result.created ? ' (pesan baru karena pesan lama hilang)' : ''}.`
    : `\n⚠️ Tersimpan, tapi panel gagal di-update: ${result.reason}`;

  return interaction.editReply({ content: `${head}${tail}` });
}

// ---------------------------------------------------------------------------
// Button (konfirmasi /games sync)
// ---------------------------------------------------------------------------
function buildSyncPrompt() {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('games:sync:confirm')
      .setLabel('Ya, reset ke seed')
      .setEmoji('♻️')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId('games:sync:cancel')
      .setLabel('Batal')
      .setStyle(ButtonStyle.Secondary)
  );

  return {
    content:
      '♻️ Ini akan **menimpa seluruh daftar game** dengan isi `src/data/games.js` ' +
      '(status semua game kembali ke default). Lanjut?',
    components: [row],
  };
}

async function handleGamesButton(interaction) {
  store.init();
  const [, action, step] = interaction.customId.split(':');

  if (action !== 'sync') {
    return replyEphemeral(interaction, 'Aksi tidak dikenal.');
  }

  if (step === 'cancel') {
    return interaction.update({ content: 'Dibatalkan. Daftar game tidak diubah.', components: [] });
  }

  await interaction.deferUpdate();
  const games = store.syncFromSeed();
  const result = await renderAndUpdate(interaction.client, { force: true });
  const tail = result.ok
    ? '✅ Panel diperbarui.'
    : `⚠️ Daftar direset, tapi panel gagal di-update: ${result.reason}`;

  return interaction.editReply({
    content: `♻️ Daftar game dikembalikan ke seed (${games.length} game).\n${tail}`,
    components: [],
  });
}

// ---------------------------------------------------------------------------
// Autocomplete
// ---------------------------------------------------------------------------
async function handleGamesAutocomplete(interaction) {
  store.init();
  const focused = interaction.options.getFocused(true);
  if (focused.name !== 'name') {
    return interaction.respond([]).catch(() => {});
  }

  const matches = store.searchGames(focused.value, 25);
  const choices = matches.map((game) => ({
    name: `${seed.statuses[game.status].emoji} ${game.name}`.slice(0, 100),
    value: game.name.slice(0, 100),
  }));

  return interaction.respond(choices).catch(() => {});
}

module.exports = {
  openMediaModal,
  openFooterModal,
  handleGamesModal,
  handleGamesButton,
  handleGamesAutocomplete,
  buildSyncPrompt,
  replyEphemeral,
};
