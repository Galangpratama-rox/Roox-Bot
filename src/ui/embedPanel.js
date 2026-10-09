'use strict';

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  ChannelType,
  CheckboxBuilder,
  FileUploadBuilder,
  LabelBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');
const { buildEmbedFromState } = require('../utils/buildEmbed');

function buttonRow(state) {
  const pid = state.pid;
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`embed:${pid}:modal:content`)
        .setLabel('Isi Utama')
        .setEmoji('📝')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`embed:${pid}:modal:media`)
        .setLabel('Media')
        .setEmoji('🖼️')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`embed:${pid}:modal:extra`)
        .setLabel('Footer & Fields')
        .setEmoji('🧩')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`embed:${pid}:modal:links`)
        .setLabel('Tombol Link')
        .setEmoji('🔗')
        .setStyle(ButtonStyle.Primary)
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`embed:${pid}:send`)
        .setLabel('Kirim')
        .setEmoji('📨')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`embed:${pid}:reset`)
        .setLabel('Reset')
        .setEmoji('♻️')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`embed:${pid}:cancel`)
        .setLabel('Batal')
        .setEmoji('✖️')
        .setStyle(ButtonStyle.Danger)
    ),
  ];
}

/**
 * Rakit isi panel (embed preview + tombol) dari state.
 * @param {object} state
 * @param {string} [note]
 */
function buildPanel(state, note = null) {
  const embed = buildEmbedFromState(state);
  if (!embed.data.description && !embed.data.title) {
    embed.setDescription('_Belum ada konten. Klik **Isi Utama** untuk mulai._');
  }

  const target = state.channelId ? `<#${state.channelId}>` : '(channel tempat command dipakai)';
  const lines = [
    note ? `**${note}**\n` : '',
    `Tujuan: ${target}`,
    state.links?.length ? `Tombol link: ${state.links.length}` : '',
    'Klik tombol di bawah untuk mengatur. Setiap perubahan langsung tampil di preview ini.',
  ];

  return {
    content: lines.filter(Boolean).join('\n'),
    embeds: [embed],
    components: buttonRow(state),
  };
}

function textInput(customId, style, value) {
  const input = new TextInputBuilder()
    .setCustomId(customId)
    .setStyle(style)
    .setRequired(false);
  if (value) input.setValue(String(value).slice(0, style === TextInputStyle.Paragraph ? 4000 : 1024));
  return input;
}

function contentModal(state) {
  const modal = new ModalBuilder()
    .setCustomId(`embed:${state.pid}:submit:content`)
    .setTitle('Isi Utama');

  const channel = new ChannelSelectMenuBuilder()
    .setCustomId('channel')
    .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
    .setRequired(false);
  if (state.channelId) channel.setDefaultChannels(state.channelId);

  modal.addLabelComponents(
    new LabelBuilder().setLabel('Title').setDescription('Judul embed').setTextInputComponent(
      textInput('title', TextInputStyle.Short, state.title)
    ),
    new LabelBuilder().setLabel('Description').setDescription('Isi embed').setTextInputComponent(
      textInput('description', TextInputStyle.Paragraph, state.description)
    ),
    new LabelBuilder().setLabel('URL').setDescription('Dibuka saat judul diklik').setTextInputComponent(
      textInput('url', TextInputStyle.Short, state.url)
    ),
    new LabelBuilder().setLabel('Channel').setDescription('Tujuan kirim (opsional)').setChannelSelectMenuComponent(
      channel
    ),
    new LabelBuilder().setLabel('Color').setDescription('Hex, contoh #5865F2').setTextInputComponent(
      textInput('color', TextInputStyle.Short, state.color)
    )
  );

  return modal;
}

function mediaModal(state) {
  const modal = new ModalBuilder()
    .setCustomId(`embed:${state.pid}:submit:media`)
    .setTitle('Media & Author');

  const upload = new FileUploadBuilder().setCustomId('image');
  upload.setMinValues(0).setMaxValues(1).setRequired(false);

  modal.addLabelComponents(
    new LabelBuilder().setLabel('Upload Image').setDescription('Gambar dari perangkat').setFileUploadComponent(
      upload
    ),
    new LabelBuilder().setLabel('Image URL').setDescription('Alternatif gambar dari link').setTextInputComponent(
      textInput('image_url', TextInputStyle.Short, state.imageUrl)
    ),
    new LabelBuilder().setLabel('Thumbnail URL').setTextInputComponent(
      textInput('thumbnail', TextInputStyle.Short, state.thumbnail)
    ),
    new LabelBuilder().setLabel('Author Name').setTextInputComponent(
      textInput('author_name', TextInputStyle.Short, state.authorName)
    ),
    new LabelBuilder().setLabel('Author Icon URL').setTextInputComponent(
      textInput('author_icon', TextInputStyle.Short, state.authorIcon)
    )
  );

  return modal;
}

function extraModal(state) {
  const modal = new ModalBuilder()
    .setCustomId(`embed:${state.pid}:submit:extra`)
    .setTitle('Footer & Fields');

  const checkbox = new CheckboxBuilder().setCustomId('timestamp').setDefault(state.timestamp);

  modal.addLabelComponents(
    new LabelBuilder().setLabel('Footer').setTextInputComponent(
      textInput('footer', TextInputStyle.Short, state.footer)
    ),
    new LabelBuilder().setLabel('Footer Icon URL').setTextInputComponent(
      textInput('footer_icon', TextInputStyle.Short, state.footerIcon)
    ),
    new LabelBuilder()
      .setLabel('Fields (JSON)')
      .setDescription('[{"name":"Judul","value":"Isi","inline":true}]')
      .setTextInputComponent(
        textInput('fields', TextInputStyle.Paragraph, state.fields.length ? JSON.stringify(state.fields) : '')
      ),
    new LabelBuilder().setLabel('Timestamp').setDescription('Tampilkan waktu saat ini').setCheckboxComponent(
      checkbox
    )
  );

  return modal;
}

function linksModal(state) {
  const modal = new ModalBuilder()
    .setCustomId(`embed:${state.pid}:submit:links`)
    .setTitle('Tombol Link');

  const value = state.links.length
    ? state.links.map((l) => `${l.label} | ${l.url}`).join('\n')
    : '';

  modal.addLabelComponents(
    new LabelBuilder()
      .setLabel('Tombol Link')
      .setDescription('Satu baris per tombol: Label | https://url')
      .setTextInputComponent(textInput('links', TextInputStyle.Paragraph, value))
  );

  return modal;
}

function buildModal(state, kind) {
  if (kind === 'content') return contentModal(state);
  if (kind === 'media') return mediaModal(state);
  if (kind === 'extra') return extraModal(state);
  if (kind === 'links') return linksModal(state);
  return null;
}

module.exports = { buildPanel, buildModal };