'use strict';

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  LabelBuilder,
  MessageFlags,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');

const seed = require('../data/games');
const store = require('../services/gameStore');
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

function clean(value) {
  const trimmed = String(value ?? '').trim();
  return trimmed.length ? trimmed : null;
}

function cleanUrl(value, label) {
  const raw = clean(value);
  if (!raw) return null;
  if (!/^https?:\/\/\S+$/i.test(raw)) {
    throw new Error(`${label} harus berupa URL yang diawali http:// atau https://`);
  }
  return raw.slice(0, 400);
}

async function replyEphemeral(interaction, content) {
  const payload = { content, flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } };
  if (interaction.deferred || interaction.replied) {
    return interaction.editReply({ content, allowedMentions: { parse: [] } }).catch(() => {});
  }
  return interaction.reply(payload).catch(() => {});
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
      .setLabel('Thumbnail URL')
      .setDescription('Gambar kecil di kanan atas')
      .setTextInputComponent(textInput('thumbnail', media.thumbnail)),
    new LabelBuilder()
      .setLabel('Banner URL (GIF)')
      .setDescription('Gambar besar di bawah, boleh .gif animasi')
      .setTextInputComponent(textInput('banner', media.banner)),
    new LabelBuilder()
      .setLabel('Author Name')
      .setDescription('Teks kecil di atas judul')
      .setTextInputComponent(textInput('author_name', media.authorName, { maxLength: 100 })),
    new LabelBuilder()
      .setLabel('Author Icon URL')
      .setDescription('Ikon di samping author name')
      .setTextInputComponent(textInput('author_icon', media.authorIcon)),
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
      .setDescription('Contoh: SORU HUB · Supported Games')
      .setTextInputComponent(textInput('footer_prefix', media.footerPrefix, { maxLength: 200 })),
    new LabelBuilder()
      .setLabel('Footer Icon URL')
      .setTextInputComponent(textInput('footer_icon', media.footerIcon))
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
        thumbnail: cleanUrl(fields.getTextInputValue('thumbnail'), 'Thumbnail URL'),
        banner: cleanUrl(fields.getTextInputValue('banner'), 'Banner URL'),
        authorName: clean(fields.getTextInputValue('author_name')),
        authorIcon: cleanUrl(fields.getTextInputValue('author_icon'), 'Author Icon URL'),
        title: clean(fields.getTextInputValue('title')),
      };
    } else if (scope === 'footer') {
      patch = {
        footerPrefix: clean(fields.getTextInputValue('footer_prefix')),
        footerIcon: cleanUrl(fields.getTextInputValue('footer_icon'), 'Footer Icon URL'),
      };
    } else {
      return interaction.editReply({ content: 'Jenis modal tidak dikenal.' });
    }
  } catch (err) {
    return interaction.editReply({ content: `❌ ${err.message}` });
  }

  store.setMedia(patch);

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
