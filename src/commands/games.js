'use strict';

const {
  ChannelType,
  InteractionContextType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} = require('discord.js');

const seed = require('../data/games');
const store = require('../services/gameStore');
const { renderAndUpdate, adoptPinned } = require('../services/panelUpdater');
const {
  openMediaModal,
  openFooterModal,
  buildSyncPrompt,
} = require('../interactions/gamesFlow');

const STATUS_CHOICES = Object.entries(seed.statuses).map(([value, status]) => ({
  name: `${status.emoji} ${status.label}`.slice(0, 100),
  value,
}));

const NAME_OPTION = (option, required = true) =>
  option
    .setName('name')
    .setDescription('Nama game (ketik untuk mencari)')
    .setRequired(required)
    .setAutocomplete(true)
    .setMaxLength(100);

const STATUS_OPTION = (option, required = true) =>
  option
    .setName('status')
    .setDescription('Status game')
    .setRequired(required)
    .addChoices(...STATUS_CHOICES);

const data = new SlashCommandBuilder()
  .setName('games')
  .setDescription('Kelola panel live "SORU HUB · Supported Games" (owner-only)')
  .setContexts(InteractionContextType.Guild)
  .addSubcommand((sub) =>
    sub
      .setName('panel')
      .setDescription('Kirim atau pulihkan panel live di channel')
      .addChannelOption((option) =>
        option
          .setName('channel')
          .setDescription('Channel tujuan (default: channel ini)')
          .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
          .setRequired(false)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName('add')
      .setDescription('Tambah game ke daftar')
      .addStringOption((option) =>
        option.setName('name').setDescription('Nama game').setRequired(true).setMaxLength(100)
      )
      .addStringOption((option) => STATUS_OPTION(option, false))
  )
  .addSubcommand((sub) =>
    sub
      .setName('set')
      .setDescription('Ubah status game')
      .addStringOption((option) => NAME_OPTION(option))
      .addStringOption((option) => STATUS_OPTION(option))
  )
  .addSubcommand((sub) =>
    sub
      .setName('rename')
      .setDescription('Ganti nama game')
      .addStringOption((option) => NAME_OPTION(option))
      .addStringOption((option) =>
        option.setName('new_name').setDescription('Nama baru').setRequired(true).setMaxLength(100)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName('remove')
      .setDescription('Hapus game dari daftar')
      .addStringOption((option) => NAME_OPTION(option))
  )
  .addSubcommand((sub) => sub.setName('list').setDescription('Lihat daftar game (hanya kamu)'))
  .addSubcommand((sub) => sub.setName('media').setDescription('Atur thumbnail, banner GIF, author, judul'))
  .addSubcommand((sub) => sub.setName('footer').setDescription('Atur teks & ikon footer panel'))
  .addSubcommand((sub) => sub.setName('refresh').setDescription('Paksa render & edit panel sekarang'))
  .addSubcommand((sub) =>
    sub
      .setName('link')
      .setDescription('Adopsi pesan panel yang sudah ada')
      .addStringOption((option) =>
        option
          .setName('message')
          .setDescription('Link pesan Discord atau format channelId/messageId')
          .setRequired(true)
          .setMaxLength(200)
      )
  )
  .addSubcommand((sub) => sub.setName('sync').setDescription('Reset daftar game ke isi src/data/games.js'))
  .addSubcommand((sub) => sub.setName('info').setDescription('Info panel: channel, pesan, jumlah game'));

function edit(interaction, content) {
  return interaction.editReply({ content, allowedMentions: { parse: [] } });
}

function countsLine() {
  const summary = store.statusSummary();
  return Object.entries(seed.statuses)
    .map(([key, status]) => `${status.emoji} ${summary[key] || 0}`)
    .join(' · ');
}

async function applyAndRender(interaction, note) {
  const result = await renderAndUpdate(interaction.client);

  if (result.ok && result.skipped) {
    return edit(interaction, `${note}\nPanel sudah sinkron (tidak perlu edit).`);
  }
  if (result.ok) {
    const extra = result.created ? '\n⚠️ Pesan lama tidak ditemukan, panel baru dikirim & di-pin.' : '';
    return edit(interaction, `${note}\n✅ Panel di <#${result.channelId}> sudah di-update.${extra}`);
  }
  return edit(interaction, `${note}\n⚠️ Data tersimpan, tapi panel gagal di-update: ${result.reason}`);
}

function parseMessageRef(raw) {
  const value = String(raw || '').trim();
  const link = value.match(/channels\/(\d{17,20})\/(\d{17,20})\/(\d{17,20})/);
  if (link) return { guildId: link[1], channelId: link[2], messageId: link[3] };

  const pair = value.match(/^(\d{17,20})\s*[/,\s]\s*(\d{17,20})$/);
  if (pair) return { guildId: null, channelId: pair[1], messageId: pair[2] };

  return null;
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------
async function handlePanel(interaction) {
  const target = interaction.options.getChannel('channel') ?? interaction.channel;
  if (!target || !target.isTextBased() || !target.guild) {
    return edit(interaction, '❌ Channel tujuan tidak valid.');
  }

  const me = interaction.guild.members.me ?? (await interaction.guild.members.fetchMe().catch(() => null));
  const perms = me ? target.permissionsFor(me) : null;
  const missing = [
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.EmbedLinks,
  ].filter((perm) => !perms?.has(perm));

  if (missing.length) {
    return edit(
      interaction,
      `❌ Bot belum punya izin **View Channel / Send Messages / Embed Links** di ${target}.`
    );
  }

  const panel = store.getPanel();
  const sameChannel = panel.channelId === target.id;
  const previous = { channelId: panel.channelId, messageId: panel.messageId };
  let adopted = { ok: false };
  let removedOld = false;

  if (!sameChannel) {
    // Hapus panel lama supaya tidak ada dua papan status yang aktif.
    if (previous.channelId && previous.messageId) {
      const oldChannel = await interaction.client.channels
        .fetch(previous.channelId)
        .catch(() => null);
      const oldMessage =
        oldChannel?.isTextBased() && oldChannel.messages
          ? await oldChannel.messages.fetch(previous.messageId).catch(() => null)
          : null;
      if (oldMessage && oldMessage.author.id === interaction.client.user.id) {
        removedOld = await oldMessage.delete().then(() => true).catch(() => false);
      }
    }

    // Pindah channel: paksa pesan baru (diadopsi dulu kalau ada panel pinned).
    store.updatePanel({ guildId: target.guild.id, channelId: target.id, messageId: null }, null);
    adopted = await adoptPinned(interaction.client, target.id);
  }

  const result = await renderAndUpdate(interaction.client, { force: true });
  if (!result.ok) {
    return edit(interaction, `❌ Gagal: ${result.reason}`);
  }

  const url = `https://discord.com/channels/${target.guild.id}/${result.channelId}/${result.messageId}`;
  const head = result.created
    ? '✅ Panel live dibuat di'
    : adopted.ok
      ? '✅ Panel lama diadopsi & disinkronkan di'
      : '✅ Panel disinkronkan di';

  const tips = result.created
    ? '\n_Pesan sudah di-pin supaya bisa dipulihkan otomatis setelah restart._'
    : '';
  const moved = removedOld ? `\n🗑️ Panel lama di <#${previous.channelId}> dihapus.` : '';

  return edit(interaction, `${head} ${target}.\n${url}${tips}${moved}`);
}

async function handleAdd(interaction) {
  const name = interaction.options.getString('name', true);
  const status = interaction.options.getString('status') ?? seed.defaultStatus;

  try {
    const game = store.addGame(name, status);
    return applyAndRender(
      interaction,
      `✅ **${game.name}** ditambahkan (${seed.statuses[game.status].emoji} ${seed.statuses[game.status].label}).`
    );
  } catch (err) {
    return edit(interaction, `❌ ${err.message}`);
  }
}

async function handleSet(interaction) {
  const name = interaction.options.getString('name', true);
  const status = interaction.options.getString('status', true);

  try {
    const { game, before } = store.setStatus(name, status);
    if (before === game.status) {
      return edit(
        interaction,
        `ℹ️ **${game.name}** sudah berstatus ${seed.statuses[game.status].emoji} ${seed.statuses[game.status].label}.`
      );
    }
    const from = `${seed.statuses[before].emoji} ${seed.statuses[before].label}`;
    const to = `${seed.statuses[game.status].emoji} ${seed.statuses[game.status].label}`;
    return applyAndRender(interaction, `✅ **${game.name}**: ${from} → ${to}.`);
  } catch (err) {
    return edit(interaction, `❌ ${err.message}`);
  }
}

async function handleRename(interaction) {
  const name = interaction.options.getString('name', true);
  const newName = interaction.options.getString('new_name', true);

  try {
    const { game, before } = store.renameGame(name, newName);
    return applyAndRender(interaction, `✅ **${before}** diganti jadi **${game.name}**.`);
  } catch (err) {
    return edit(interaction, `❌ ${err.message}`);
  }
}

async function handleRemove(interaction) {
  const name = interaction.options.getString('name', true);

  try {
    const game = store.removeGame(name);
    return applyAndRender(interaction, `🗑️ **${game.name}** dihapus dari daftar.`);
  } catch (err) {
    return edit(interaction, `❌ ${err.message}`);
  }
}

async function handleList(interaction) {
  const games = store.getGames();
  const lines = games.length
    ? games.map((game) => `${seed.statuses[game.status].emoji} ${game.name}`).join('\n')
    : '_Belum ada game._';

  const header = `**Daftar game (${games.length})**\n${countsLine()}\n`;
  const budget = 1800 - header.length;
  const body = lines.length > budget ? `${lines.slice(0, budget)}\n…_(dipotong)_` : lines;

  return edit(interaction, `${header}\n${body}`);
}

async function handleRefresh(interaction) {
  const result = await renderAndUpdate(interaction.client, { force: true });

  if (!result.ok) return edit(interaction, `❌ Gagal: ${result.reason}`);

  const url = `https://discord.com/channels/${interaction.guildId}/${result.channelId}/${result.messageId}`;
  const extra = result.created ? '\n⚠️ Pesan lama tidak ditemukan, panel baru dikirim & di-pin.' : '';
  return edit(interaction, `✅ Panel di-refresh.\n${url}${extra}`);
}

async function handleLink(interaction) {
  const raw = interaction.options.getString('message', true);
  const ref = parseMessageRef(raw);
  if (!ref) {
    return edit(
      interaction,
      '❌ Format tidak dikenal. Kirim link pesan Discord (klik kanan pesan → Copy Message Link) ' +
        'atau `channelId/messageId`.'
    );
  }

  const channel = await interaction.client.channels.fetch(ref.channelId).catch(() => null);
  if (!channel || !channel.isTextBased()) {
    return edit(interaction, `❌ Channel \`${ref.channelId}\` tidak bisa diakses bot.`);
  }

  const message = await channel.messages.fetch(ref.messageId).catch(() => null);
  if (!message) {
    return edit(interaction, `❌ Pesan \`${ref.messageId}\` tidak ditemukan di ${channel}.`);
  }
  if (message.author.id !== interaction.client.user.id) {
    return edit(interaction, '❌ Pesan itu bukan dikirim oleh bot ini.');
  }

  store.updatePanel(
    { guildId: channel.guild?.id ?? null, channelId: channel.id, messageId: message.id },
    null
  );

  const result = await renderAndUpdate(interaction.client, { force: true });
  if (!result.ok) return edit(interaction, `❌ Panel disimpan tapi gagal di-update: ${result.reason}`);

  return edit(interaction, `✅ Pesan ${message.url} sekarang dipakai sebagai panel.`);
}

async function handleSync(interaction) {
  return interaction.editReply(buildSyncPrompt());
}

async function handleInfo(interaction) {
  const panel = store.getPanel();
  const games = store.getGames();
  const updatedAt = panel.updatedAt ? `<t:${Math.floor(panel.updatedAt / 1000)}:R>` : '_belum pernah_';
  const messageRef = panel.messageId
    ? `https://discord.com/channels/${panel.guildId || interaction.guildId}/${panel.channelId}/${panel.messageId}`
    : '_belum ada_';

  const lines = [
    `**Panel live SORU HUB**`,
    `Channel: ${panel.channelId ? `<#${panel.channelId}>` : '_belum diset_'}`,
    `Pesan: ${messageRef}`,
    `Total game: **${games.length}** (${countsLine()})`,
    `Update terakhir: ${updatedAt}`,
    `State file: \`${store.stateFilePath()}\``,
    '',
    panel.messageId
      ? '_Butuh repair? Jalankan `/games panel` atau `/games link <link pesan>`._'
      : '_Kirim panel pertama dengan `/games panel`._',
  ];

  return edit(interaction, lines.join('\n'));
}

const HANDLERS = {
  panel: handlePanel,
  add: handleAdd,
  set: handleSet,
  rename: handleRename,
  remove: handleRemove,
  list: handleList,
  refresh: handleRefresh,
  link: handleLink,
  sync: handleSync,
  info: handleInfo,
};

module.exports = {
  data,

  async execute(interaction) {
    store.init();
    const subcommand = interaction.options.getSubcommand(true);

    // Modal harus jadi respons pertama, jadi jangan defer dulu.
    if (subcommand === 'media') return openMediaModal(interaction);
    if (subcommand === 'footer') return openFooterModal(interaction);

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const handler = HANDLERS[subcommand];
    if (!handler) return edit(interaction, 'Subcommand tidak dikenal.');
    return handler(interaction);
  },
};
