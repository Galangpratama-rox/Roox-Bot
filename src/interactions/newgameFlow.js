'use strict';

const { MessageFlags, PermissionFlagsBits } = require('discord.js');
const store = require('../utils/newgameState');
const { buildNewGamePayload, stateFromEmbed } = require('../utils/buildNewGameEmbed');
const { buildPanel, buildModal } = require('../ui/newgamePanel');

const ALLOWED_UPLOAD = /\.(png|jpe?g|gif|webp|apng)$/i;

function deny(interaction, message) {
  const payload = { content: message, flags: MessageFlags.Ephemeral };
  if (interaction.deferred || interaction.replied) {
    return interaction.followUp(payload).catch(() => {});
  }
  return interaction.reply(payload).catch(() => {});
}

function clean(value) {
  const trimmed = String(value ?? '').trim();
  return trimmed.length ? trimmed : null;
}

/**
 * Ambil sesi. Kalau hilang dari memori & disk (mis. habis restart/redeploy),
 * bangun ulang dari embed pesan panel supaya tombol tetap jalan.
 */
function resolveState(interaction, pid) {
  const cached = store.getState(pid);
  if (cached) return cached;

  const embed = interaction.message?.embeds?.[0];
  const restored = stateFromEmbed(embed, { pid, ownerId: interaction.user.id });
  if (restored) return store.adopt(restored);

  return null;
}

async function currentChannel(interaction, state) {
  if (!state.targetChannelId) return interaction.channel;
  return (
    interaction.client.channels.cache.get(state.targetChannelId) ??
    interaction.client.channels.fetch(state.targetChannelId).catch(() => null)
  );
}

async function sendNewGame(interaction, state) {
  await interaction.deferUpdate();

  if (!String(state.gameName || '').trim()) {
    return interaction.editReply(buildPanel(state, 'Isi dulu nama game lewat tombol **Isi Game**.'));
  }

  const channel = await currentChannel(interaction, state);
  if (!channel || !channel.isTextBased()) {
    return interaction.editReply(buildPanel(state, 'Channel tujuan tidak valid.'));
  }

  const me = interaction.guild.members.me ?? (await interaction.guild.members.fetchMe().catch(() => null));
  const perms = me ? channel.permissionsFor(me) : null;
  const allowed =
    perms?.has(PermissionFlagsBits.ViewChannel) &&
    perms?.has(PermissionFlagsBits.SendMessages) &&
    perms?.has(PermissionFlagsBits.EmbedLinks);

  if (!allowed) {
    return interaction.editReply(
      buildPanel(state, `Bot belum punya izin **View Channel / Send Messages / Embed Links** di ${channel}.`)
    );
  }

  const payload = buildNewGamePayload(state);
  try {
    await channel.send({ embeds: payload.embeds, files: payload.files });
  } catch (err) {
    return interaction.editReply(buildPanel(state, `Gagal mengirim: ${err.message}`));
  }

  store.deleteState(state.pid);
  return interaction.editReply({
    content: `✅ Pengumuman **${state.gameName}** terkirim ke ${channel}. Panel ditutup.`,
    embeds: [],
    components: [],
  });
}

// ---------------------------------------------------------------------------
// Tombol
// ---------------------------------------------------------------------------
async function handleButton(interaction) {
  const parts = interaction.customId.split(':');
  const pid = parts[1];
  const action = parts.slice(2).join(':');

  const state = resolveState(interaction, pid);
  if (!state) {
    return deny(interaction, 'Sesi /newgame ini sudah kadaluwarsa. Jalankan `/newgame` lagi.');
  }
  if (state.ownerId !== interaction.user.id) {
    return deny(interaction, 'Panel ini bukan milikmu.');
  }

  if (action === 'cancel') {
    store.deleteState(pid);
    return interaction.update({ content: 'Panel ditutup.', embeds: [], components: [], files: [] });
  }

  if (action === 'reset') {
    state.gameName = '';
    state.description = null;
    state.thumbnailUrl = null;
    state.thumbnailFile = null;
    state.features = [];
    state.keyChannelId = null;
    state.loaderChannelId = null;
    // Script & warna dibiarkan (biasanya tetap sama tiap announce).
    store.save(state);
    return interaction.update(buildPanel(state, 'Panel direset.'));
  }

  if (action === 'send') {
    return sendNewGame(interaction, state);
  }

  if (action.startsWith('modal:')) {
    const kind = action.slice('modal:'.length);
    const modal = buildModal(state, kind);
    if (!modal) return deny(interaction, 'Modal tidak dikenal.');
    return interaction.showModal(modal);
  }

  return deny(interaction, 'Aksi tidak dikenal.');
}

// ---------------------------------------------------------------------------
// Modal submit
// ---------------------------------------------------------------------------
async function handleModalSubmit(interaction) {
  const parts = interaction.customId.split(':');
  const pid = parts[1];
  const kind = parts[3];
  const fields = interaction.fields;

  const state = resolveState(interaction, pid);
  if (!state) {
    return deny(interaction, 'Sesi /newgame ini sudah kadaluwarsa. Jalankan `/newgame` lagi.');
  }
  if (state.ownerId !== interaction.user.id) {
    return deny(interaction, 'Panel ini bukan milikmu.');
  }

  if (kind === 'info') {
    const color = clean(fields.getTextInputValue('color'));
    if (color && !/^#[0-9a-fA-F]{6}$/.test(color)) {
      return interaction.update(buildPanel(state, 'Warna harus format hex, contoh #5865F2.'));
    }

    state.gameName = clean(fields.getTextInputValue('game_name')) ?? '';
    state.description = clean(fields.getTextInputValue('description'));
    state.thumbnailUrl = clean(fields.getTextInputValue('thumbnail_url'));
    if (color) state.color = color;

    const uploaded = fields.getUploadedFiles('thumbnail');
    if (uploaded?.size) {
      const attachment = [...uploaded.values()][0];
      if (!ALLOWED_UPLOAD.test(attachment.name)) {
        return interaction.update(
          buildPanel(state, `File "${attachment.name}" tidak didukung. Pakai PNG, JPG, WEBP, atau GIF.`)
        );
      }
      state.thumbnailFile = { url: attachment.url, name: attachment.name };
    }
  } else if (kind === 'features') {
    state.features = String(fields.getTextInputValue('features') || '')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  } else if (kind === 'script') {
    state.script = String(fields.getTextInputValue('script') || '').trim();

    const key = fields.getSelectedChannels('key_channel');
    state.keyChannelId = key?.size ? [...key.keys()][0] : null;
    const loader = fields.getSelectedChannels('loader_channel');
    state.loaderChannelId = loader?.size ? [...loader.keys()][0] : null;
    const target = fields.getSelectedChannels('target_channel');
    state.targetChannelId = target?.size ? [...target.keys()][0] : null;
  } else {
    return deny(interaction, 'Jenis modal tidak dikenal.');
  }

  store.save(state);
  return interaction.update(buildPanel(state, 'Tersimpan.'));
}

module.exports = { handleButton, handleModalSubmit };
