'use strict';

const { MessageFlags, PermissionFlagsBits } = require('discord.js');
const { getState, deleteState } = require('../utils/embedState');
const { parseFields, parseLinks, isEmptyState, buildSendPayload } = require('../utils/buildEmbed');
const { buildPanel, buildModal } = require('../ui/embedPanel');

function deny(interaction, message) {
  const payload = { content: message, flags: MessageFlags.Ephemeral };
  if (interaction.deferred || interaction.replied) {
    return interaction.followUp(payload).catch(() => {});
  }
  return interaction.reply(payload).catch(() => {});
}

function clean(value) {
  const v = (value ?? '').trim();
  return v.length ? v : null;
}

async function handleButton(interaction, pid, action) {
  const state = getState(pid);
  if (!state) {
    return deny(interaction, 'Sesi panel ini sudah kedaluwarsa. Jalankan `/embed` lagi.');
  }
  if (state.ownerId !== interaction.user.id) {
    return deny(interaction, 'Panel ini bukan milikmu.');
  }

  if (action === 'cancel') {
    deleteState(pid);
    return interaction.update({ content: 'Panel ditutup.', embeds: [], components: [] });
  }

  if (action === 'reset') {
    state.channelId = null;
    state.title = null;
    state.description = null;
    state.url = null;
    state.color = null;
    state.imageUrl = null;
    state.thumbnail = null;
    state.authorName = null;
    state.authorIcon = null;
    state.footer = null;
    state.footerIcon = null;
    state.fields = [];
    state.links = [];
    state.timestamp = false;
    state.uploaded = [];
    return interaction.update(buildPanel(state, 'Panel direset.'));
  }

  if (action === 'send') {
    return sendEmbed(interaction, state);
  }

  if (action.startsWith('modal:')) {
    const kind = action.slice('modal:'.length);
    const modal = buildModal(state, kind);
    if (!modal) return deny(interaction, 'Modal tidak dikenal.');
    return interaction.showModal(modal);
  }

  return deny(interaction, 'Aksi tidak dikenal.');
}

async function handleModalSubmit(interaction, pid, kind) {
  const state = getState(pid);
  if (!state) {
    return deny(interaction, 'Sesi panel ini sudah kedaluwarsa. Jalankan `/embed` lagi.');
  }
  if (state.ownerId !== interaction.user.id) {
    return deny(interaction, 'Panel ini bukan milikmu.');
  }

  const fields = interaction.fields;

  if (kind === 'content') {
    state.title = clean(fields.getTextInputValue('title'));
    state.description = clean(fields.getTextInputValue('description'));
    state.url = clean(fields.getTextInputValue('url'));
    state.color = clean(fields.getTextInputValue('color'));

    const channels = fields.getSelectedChannels('channel');
    state.channelId = channels?.size ? [...channels.keys()][0] : null;
  } else if (kind === 'media') {
    state.imageUrl = clean(fields.getTextInputValue('image_url'));
    state.thumbnail = clean(fields.getTextInputValue('thumbnail'));
    state.authorName = clean(fields.getTextInputValue('author_name'));
    state.authorIcon = clean(fields.getTextInputValue('author_icon'));

    const uploaded = fields.getUploadedFiles('image');
    state.uploaded = uploaded?.size
      ? [...uploaded.values()].map((a) => ({ url: a.url, name: a.name }))
      : [];
  } else if (kind === 'extra') {
    const rawFields = clean(fields.getTextInputValue('fields'));
    try {
      state.fields = rawFields ? parseFields(rawFields) : [];
    } catch (err) {
      return interaction.update(buildPanel(state, `Fields gagal diproses: ${err.message}`));
    }
    state.footer = clean(fields.getTextInputValue('footer'));
    state.footerIcon = clean(fields.getTextInputValue('footer_icon'));
    state.timestamp = fields.getCheckbox('timestamp');
  } else if (kind === 'links') {
    const rawLinks = clean(fields.getTextInputValue('links'));
    try {
      state.links = rawLinks ? parseLinks(rawLinks) : [];
    } catch (err) {
      return interaction.update(buildPanel(state, `Tombol link gagal diproses: ${err.message}`));
    }
  } else {
    return deny(interaction, 'Jenis modal tidak dikenal.');
  }

  return interaction.update(buildPanel(state, 'Tersimpan.'));
}

async function sendEmbed(interaction, state) {
  await interaction.deferUpdate();

  if (isEmptyState(state)) {
    return interaction.editReply(buildPanel(state, 'Embed masih kosong. Isi minimal Title atau Description.'));
  }

  const channel = state.channelId
    ? interaction.client.channels.cache.get(state.channelId) ??
      (await interaction.client.channels.fetch(state.channelId).catch(() => null))
    : interaction.channel;

  if (!channel || !channel.isTextBased()) {
    return interaction.editReply(buildPanel(state, 'Channel tujuan tidak valid.'));
  }

  const me = interaction.guild.members.me ?? (await interaction.guild.members.fetchMe());
  const perms = channel.permissionsFor(me);
  if (!perms?.has(PermissionFlagsBits.ViewChannel) || !perms?.has(PermissionFlagsBits.SendMessages)) {
    return interaction.editReply(
      buildPanel(state, `Bot tidak punya izin mengirim di ${channel}.`)
    );
  }

  const { embed, files, components } = buildSendPayload(state);

  try {
    await channel.send({ embeds: [embed], files, components });
  } catch (err) {
    return interaction.editReply(buildPanel(state, `Gagal mengirim: ${err.message}`));
  }

  deleteState(state.pid);
  return interaction.editReply({
    content: `Embed terkirim ke ${channel}. Panel ditutup.`,
    embeds: [],
    components: [],
  });
}

module.exports = { handleButton, handleModalSubmit };