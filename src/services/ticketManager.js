'use strict';

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  PermissionFlagsBits,
} = require('discord.js');

const config = require('../config');
const ticketStore = require('./ticketStore');
const { isOnCooldown } = require('../utils/cooldown');

const TICKET_COLOR = 0x8b5cf6;

const USER_PERMS = [
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.SendMessages,
  PermissionFlagsBits.ReadMessageHistory,
  PermissionFlagsBits.AttachFiles,
];

const STAFF_PERMS = [...USER_PERMS, PermissionFlagsBits.ManageMessages];

const BOT_PERMS = [
  ...STAFF_PERMS,
  PermissionFlagsBits.EmbedLinks,
  PermissionFlagsBits.ManageChannels,
];

const REQUIRED_BOT_PERMS = [
  [PermissionFlagsBits.ManageChannels, 'Manage Channels'],
  [PermissionFlagsBits.ManageRoles, 'Manage Roles'],
  [PermissionFlagsBits.ViewChannel, 'View Channel'],
  [PermissionFlagsBits.SendMessages, 'Send Messages'],
  [PermissionFlagsBits.EmbedLinks, 'Embed Links'],
  [PermissionFlagsBits.ReadMessageHistory, 'Read Message History'],
];

async function fetchChannel(client, channelId) {
  if (!channelId) return null;
  const cached = client.channels.cache.get(channelId);
  if (cached) return cached;
  return client.channels.fetch(channelId).catch(() => null);
}

/**
 * Role yang dianggap staff: punya izin Manage Channels + role tambahan dari env.
 * @param {import('discord.js').Guild} guild
 */
function staffRoleIds(guild) {
  const ids = new Set((config.ticket?.staffRoles || []).filter((id) => /^\d{17,20}$/.test(id)));

  for (const role of guild.roles.cache.values()) {
    if (role.id === guild.id || role.managed) continue;
    if (role.permissions.has(PermissionFlagsBits.ManageChannels)) ids.add(role.id);
  }

  return [...ids];
}

/**
 * Cari kategori tiket: pilihan /ticket setup (state) -> env ID -> nama kategori.
 * @param {import('discord.js').Guild} guild
 */
async function resolveCategory(guild) {
  const cfg = ticketStore.getConfig();

  const wantedId = cfg.categoryId || config.ticket?.categoryId;
  if (wantedId) {
    const byId = await fetchChannel(guild.client, wantedId);
    if (byId && byId.type === ChannelType.GuildCategory) return byId;
  }

  const wantedName = (cfg.categoryName || config.ticket?.categoryName || 'Premium').toLowerCase();
  return (
    guild.channels.cache.find(
      (channel) => channel.type === ChannelType.GuildCategory && channel.name.toLowerCase() === wantedName
    ) ?? null
  );
}

/**
 * Cek izin bot untuk mengelola tiket.
 * @param {import('discord.js').Guild} guild
 * @param {import('discord.js').CategoryChannel|null} category
 */
function checkSetup(guild, category = null) {
  const me = guild.members.me ?? null;
  if (!me) return { ok: false, missing: ['(bot tidak ada di server ini)'], warnings: [] };

  const missing = REQUIRED_BOT_PERMS.filter(([perm]) => !me.permissions.has(perm)).map(([, label]) => label);
  if (!category) missing.push('kategori tiket (jalankan /ticket setup)');

  const warnings = [];
  const staffPositions = staffRoleIds(guild)
    .map((id) => guild.roles.cache.get(id)?.position ?? 0)
    .filter((position) => position > 0);

  if (staffPositions.length && me.roles.highest.position <= Math.max(...staffPositions)) {
    warnings.push(
      'Posisi role bot harus di atas role staff supaya bot bisa mengatur izin channel tiket.'
    );
  }

  return { ok: missing.length === 0, missing, warnings, staffRoles: staffRoleIds(guild) };
}

/**
 * Overwrite izin channel tiket.
 * @param {import('discord.js').Guild} guild
 * @param {string} ownerId
 */
function buildOverwrites(guild, ownerId) {
  const overwrites = [
    { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    { id: ownerId, allow: USER_PERMS },
    { id: guild.members.me.id, allow: BOT_PERMS },
  ];

  for (const roleId of staffRoleIds(guild)) {
    if (roleId === guild.id) continue;
    overwrites.push({ id: roleId, allow: STAFF_PERMS });
  }

  return overwrites;
}

function welcomeComponents(ticket) {
  const row = new ActionRowBuilder();

  if (ticket.status === 'closed') {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`tk:${ticket.channelId}:reopen`)
        .setLabel('Buka lagi')
        .setEmoji('🔓')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`tk:${ticket.channelId}:delete`)
        .setLabel('Hapus')
        .setEmoji('🗑️')
        .setStyle(ButtonStyle.Danger)
    );
  } else {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`tk:${ticket.channelId}:close`)
        .setLabel('Tutup')
        .setEmoji('🔒')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId(`tk:${ticket.channelId}:delete`)
        .setLabel('Hapus')
        .setEmoji('🗑️')
        .setStyle(ButtonStyle.Secondary)
    );
  }

  return [row];
}

function buildWelcomeEmbed(ticket) {
  const lines = [
    `Halo <@${ticket.ownerId}>, tiketmu sudah dibuat.`,
    ticket.topic ? `**Topik:** ${ticket.topic}` : null,
    '',
    'Jelaskan kebutuhanmu di channel ini. Staff akan segera membantu.',
    '',
    '**Tombol:**',
    '🔒 **Tutup** — tandai tiket selesai',
    '🔓 **Buka lagi** — lanjutkan tiket yang ditutup',
    '🗑️ **Hapus** — hapus channel tiket (staff)',
  ].filter((line) => line !== null);

  return new EmbedBuilder()
    .setColor(TICKET_COLOR)
    .setTitle(`🎫 Tiket #${ticketStore.formatNumber(ticket.number)}`)
    .setDescription(lines.join('\n'))
    .setFooter({ text: 'Roox Hub · Support Ticket' })
    .setTimestamp(new Date(ticket.createdAt));
}

async function sendWelcome(channel, ticket) {
  const mentions = [`<@${ticket.ownerId}>`];
  if (config.ticket?.pingRoleId) mentions.push(`<@&${config.ticket.pingRoleId}>`);

  return channel.send({
    content: mentions.join(' '),
    embeds: [buildWelcomeEmbed(ticket)],
    components: welcomeComponents(ticket),
    allowedMentions: {
      users: [ticket.ownerId],
      roles: config.ticket?.pingRoleId ? [config.ticket.pingRoleId] : [],
    },
  });
}

/** Update komponen tombol di pesan welcome (mis. setelah tutup/buka). */
async function refreshWelcome(channel, ticket) {
  if (!ticket.welcomeMessageId) return;
  const message = await channel.messages.fetch(ticket.welcomeMessageId).catch(() => null);
  if (!message) return;
  await message.edit({ components: welcomeComponents(ticket) }).catch(() => {});
}

// ---------------------------------------------------------------------------
// Buat tiket
// ---------------------------------------------------------------------------
/**
 * @param {import('discord.js').ButtonInteraction} interaction
 * @param {{ topic?: string|null, source?: string|null }} [options]
 */
async function openTicket(interaction, options = {}) {
  const guild = interaction.guild;
  if (!guild) return { ok: false, reason: 'Tiket hanya bisa dibuat di dalam server.' };

  // Cek tiket yang masih terbuka dulu supaya pesannya jelas.
  const existing = ticketStore.findOpenByOwner(guild.id, interaction.user.id);
  if (existing) {
    const channel = await fetchChannel(interaction.client, existing.channelId);
    if (channel) return { ok: false, reason: 'already', channelId: channel.id };
    ticketStore.removeTicket(existing.channelId);
  }

  const cooldownMs = config.ticket?.cooldownMs ?? 30000;
  if (isOnCooldown(`ticket:${guild.id}:${interaction.user.id}`, cooldownMs)) {
    return { ok: false, reason: 'Tunggu sebentar sebelum membuat tiket lagi.' };
  }

  const category = await resolveCategory(guild);
  if (!category) {
    return {
      ok: false,
      reason: 'Kategori tiket belum diatur. Staff: jalankan `/ticket setup`.',
    };
  }

  const setup = checkSetup(guild, category);
  if (!setup.ok) {
    return { ok: false, reason: `Bot belum siap: ${setup.missing.join(', ')}.` };
  }

  const number = ticketStore.nextNumber();
  const topic = options.topic ? String(options.topic).slice(0, 100) : null;

  let channel;
  try {
    channel = await guild.channels.create({
      name: `ticket-${ticketStore.formatNumber(number)}`,
      type: ChannelType.GuildText,
      parent: category.id,
      topic: [
        `Tiket #${ticketStore.formatNumber(number)}`,
        `${interaction.user.tag} (${interaction.user.id})`,
        topic,
      ]
        .filter(Boolean)
        .join(' | ')
        .slice(0, 1024),
      permissionOverwrites: buildOverwrites(guild, interaction.user.id),
      reason: `Tiket dibuat oleh ${interaction.user.tag}`,
    });
  } catch (err) {
    return { ok: false, reason: `Gagal membuat channel tiket: ${err.message}` };
  }

  const ticket = ticketStore.createTicketRecord({
    number,
    guildId: guild.id,
    channelId: channel.id,
    ownerId: interaction.user.id,
    ownerTag: interaction.user.tag,
    topic,
    source: options.source ?? null,
    status: 'open',
  });

  const welcome = await sendWelcome(channel, ticket).catch((err) => {
    console.warn(`[ticket] gagal kirim pesan welcome: ${err.message}`);
    return null;
  });
  if (welcome) ticketStore.updateTicket(channel.id, { welcomeMessageId: welcome.id });

  return { ok: true, channelId: channel.id, number: ticket.number };
}

// ---------------------------------------------------------------------------
// Tutup / buka lagi / hapus
// ---------------------------------------------------------------------------
async function closeTicket(interaction, ticket) {
  const channel = await fetchChannel(interaction.client, ticket.channelId);
  if (!channel) return { ok: false, reason: 'Channel tiket tidak ditemukan.' };

  await channel.permissionOverwrites
    .edit(ticket.ownerId, { SendMessages: false, SendMessagesInThreads: false })
    .catch(() => {});
  await channel.setName(`closed-${ticketStore.formatNumber(ticket.number)}`).catch(() => {});

  const updated = ticketStore.updateTicket(ticket.channelId, {
    status: 'closed',
    closedAt: Date.now(),
    closedBy: interaction.user.id,
  });

  await refreshWelcome(channel, updated);
  await channel
    .send({
      content: `🔒 Tiket ditutup oleh <@${interaction.user.id}>.`,
      allowedMentions: { users: [interaction.user.id] },
    })
    .catch(() => {});

  return { ok: true, ticket: updated };
}

async function reopenTicket(interaction, ticket) {
  const channel = await fetchChannel(interaction.client, ticket.channelId);
  if (!channel) return { ok: false, reason: 'Channel tiket tidak ditemukan.' };

  await channel.permissionOverwrites
    .edit(ticket.ownerId, { SendMessages: true, SendMessagesInThreads: true, ViewChannel: true, ReadMessageHistory: true })
    .catch(() => {});
  await channel.setName(`ticket-${ticketStore.formatNumber(ticket.number)}`).catch(() => {});

  const updated = ticketStore.updateTicket(ticket.channelId, {
    status: 'open',
    closedAt: null,
    closedBy: null,
  });

  await refreshWelcome(channel, updated);
  await channel
    .send({
      content: `🔓 Tiket dibuka lagi oleh <@${interaction.user.id}>.`,
      allowedMentions: { users: [interaction.user.id] },
    })
    .catch(() => {});

  return { ok: true, ticket: updated };
}

async function deleteTicket(interaction, ticket) {
  const channel = await fetchChannel(interaction.client, ticket.channelId);
  ticketStore.removeTicket(ticket.channelId);

  if (channel) {
    await channel.delete(`Tiket dihapus oleh ${interaction.user.tag}`).catch(() => {});
  }

  return { ok: true };
}

module.exports = {
  TICKET_COLOR,
  staffRoleIds,
  resolveCategory,
  checkSetup,
  buildOverwrites,
  welcomeComponents,
  buildWelcomeEmbed,
  openTicket,
  closeTicket,
  reopenTicket,
  deleteTicket,
  refreshWelcome,
  fetchChannel,
};
