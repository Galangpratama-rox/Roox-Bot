'use strict';

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  ChannelType,
  FileUploadBuilder,
  LabelBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');
const { buildNewGameEmbed } = require('../utils/buildNewGameEmbed');

function textInput(customId, value, { paragraph = false, maxLength = 1024 } = {}) {
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

function channelSelect(customId, selectedId) {
  const select = new ChannelSelectMenuBuilder()
    .setCustomId(customId)
    .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
    .setRequired(false);
  if (selectedId) select.setDefaultChannels(selectedId);
  return select;
}

function buttonRow(state) {
  const pid = state.pid;
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`newgame:${pid}:modal:info`)
        .setLabel('Isi Game')
        .setEmoji('📝')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`newgame:${pid}:modal:features`)
        .setLabel('Fitur')
        .setEmoji('✨')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`newgame:${pid}:modal:script`)
        .setLabel('Script & Channel')
        .setEmoji('📜')
        .setStyle(ButtonStyle.Primary)
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`newgame:${pid}:send`)
        .setLabel('Kirim')
        .setEmoji('📨')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`newgame:${pid}:reset`)
        .setLabel('Reset')
        .setEmoji('♻️')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`newgame:${pid}:cancel`)
        .setLabel('Batal')
        .setEmoji('✖️')
        .setStyle(ButtonStyle.Danger)
    ),
  ];
}

/**
 * Rakit isi panel preview (embed + tombol) dari state.
 * @param {object} state
 * @param {string} [note]
 */
function buildPanel(state, note = null) {
  const embed = buildNewGameEmbed(state);

  const target = state.targetChannelId
    ? `<#${state.targetChannelId}>`
    : '(channel tempat command dipakai)';
  const lines = [
    note ? `**${note}**\n` : '',
    `Target kirim: ${target}`,
    `Daftar fitur: ${state.features.length}`,
    state.keyChannelId ? `Channel key: <#${state.keyChannelId}>` : '',
    state.loaderChannelId ? `Channel loader: <#${state.loaderChannelId}>` : '',
    state.thumbnailFile ? 'Thumbnail: upload (tampil saat dikirim)' : '',
    'Klik tombol di bawah untuk mengisi. Preview langsung ter-update.',
  ];

  return {
    content: lines.filter(Boolean).join('\n'),
    embeds: [embed],
    files: [],
    components: buttonRow(state),
  };
}

function infoModal(state) {
  const modal = new ModalBuilder()
    .setCustomId(`newgame:${state.pid}:submit:info`)
    .setTitle('Isi Game');

  modal.addLabelComponents(
    new LabelBuilder()
      .setLabel('Game Name')
      .setDescription('Nama game, mis. Ant Evolution')
      .setTextInputComponent(textInput('game_name', state.gameName, { maxLength: 100 })),
    new LabelBuilder()
      .setLabel('Description')
      .setDescription('Kalau kosong dipakai template default')
      .setTextInputComponent(textInput('description', state.description, { paragraph: true, maxLength: 2000 })),
    new LabelBuilder()
      .setLabel('Thumbnail')
      .setDescription('Gambar kecil di kanan atas — PNG/JPG/GIF')
      .setFileUploadComponent(fileInput('thumbnail')),
    new LabelBuilder()
      .setLabel('Thumbnail URL')
      .setDescription('Alternatif thumbnail dari link')
      .setTextInputComponent(textInput('thumbnail_url', state.thumbnailUrl, { maxLength: 400 })),
    new LabelBuilder()
      .setLabel('Color')
      .setDescription('Hex, contoh #5865F2')
      .setTextInputComponent(textInput('color', state.color, { maxLength: 7 }))
  );

  return modal;
}

function featuresModal(state) {
  const modal = new ModalBuilder()
    .setCustomId(`newgame:${state.pid}:submit:features`)
    .setTitle('Daftar Fitur');

  modal.addLabelComponents(
    new LabelBuilder()
      .setLabel('Features')
      .setDescription('Satu baris = satu fitur (otomatis jadi "+ Fitur")')
      .setTextInputComponent(
        textInput('features', state.features.join('\n'), { paragraph: true, maxLength: 2000 })
      )
  );

  return modal;
}

function scriptModal(state) {
  const modal = new ModalBuilder()
    .setCustomId(`newgame:${state.pid}:submit:script`)
    .setTitle('Script & Channel');

  modal.addLabelComponents(
    new LabelBuilder()
      .setLabel('Script')
      .setDescription('Kode loader yang muncul di blok Script')
      .setTextInputComponent(
        textInput('script', state.script, { paragraph: true, maxLength: 1900 })
      ),
    new LabelBuilder()
      .setLabel('Key Channel')
      .setDescription('Untuk baris "Get your key in ..."')
      .setChannelSelectMenuComponent(channelSelect('key_channel', state.keyChannelId)),
    new LabelBuilder()
      .setLabel('Loader Channel')
      .setDescription('Untuk baris "Get the official loader in ..."')
      .setChannelSelectMenuComponent(channelSelect('loader_channel', state.loaderChannelId)),
    new LabelBuilder()
      .setLabel('Target Channel')
      .setDescription('Channel tujuan kirim (opsional)')
      .setChannelSelectMenuComponent(channelSelect('target_channel', state.targetChannelId))
  );

  return modal;
}

function buildModal(state, kind) {
  if (kind === 'info') return infoModal(state);
  if (kind === 'features') return featuresModal(state);
  if (kind === 'script') return scriptModal(state);
  return null;
}

module.exports = { buildPanel, buildModal };
