'use strict';

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  InteractionContextType,
  MessageFlags,
  SlashCommandBuilder,
} = require('discord.js');

const config = require('../config');
const ticketStore = require('../services/ticketStore');
const manager = require('../services/ticketManager');

const NUMBER_RE = /^(?:ticket|closed)-(\d+)$/i;

const data = new SlashCommandBuilder()
  .setName('ticket')
  .setDescription('Sistem tiket: setup kategori & panel (owner-only)')
  .setContexts(InteractionContextType.Guild)
  .addSubcommand((sub) =>
    sub
      .setName('setup')
      .setDescription('Pilih kategori tempat channel tiket dibuat')
      .addChannelOption((option) =>
        option
          .setName('category')
          .setDescription('Kategori tiket (mis. Premium). Kosong = cari otomatis')
          .addChannelTypes(ChannelType.GuildCategory)
          .setRequired(false)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName('panel')
      .setDescription('Kirim panel "Buat Tiket" dengan tombol')
      .addChannelOption((option) =>
        option
          .setName('channel')
          .setDescription('Channel tujuan (default: channel ini)')
          .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
          .setRequired(false)
      )
  )
  .addSubcommand((sub) => sub.setName('list').setDescription('Lihat daftar tiket'))
  .addSubcommand((sub) => sub.setName('info').setDescription('Lihat konfigurasi & status sistem tiket'));

function edit(interaction, content) {
  return interaction.editReply({ content, allowedMentions: { parse: [] } });
}

function panelPayload() {
  const embed = new EmbedBuilder()
    .setColor(manager.TICKET_COLOR)
    .setTitle('🎫 Butuh Bantuan?')
    .setDescription('Klik tombol di bawah untuk membuka tiket. Staff akan segera membantu.')
    .setFooter({ text: 'Roox Hub · Support Ticket' });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('tkc:new')
      .setLabel('Buat Tiket')
      .setEmoji('🎫')
      .setStyle(ButtonStyle.Primary)
  );

  return { embeds: [embed], components: [row] };
}

async function handleSetup(interaction) {
  const guild = interaction.guild;
  const chosen = interaction.options.getChannel('category');

  const category = chosen ?? (await manager.resolveCategory(guild));
  if (!category || category.type !== ChannelType.GuildCategory) {
    return edit(
      interaction,
      '❌ Kategori tiket tidak ditemukan. Pilih kategorinya: `/ticket setup category:#Premium`.'
    );
  }

  ticketStore.setConfig({
    guildId: guild.id,
    categoryId: category.id,
    categoryName: category.name,
  });

  // Lanjutkan penomoran dari channel tiket yang sudah ada di kategori ini.
  let highest = 0;
  for (const channel of category.children.cache.values()) {
    const match = NUMBER_RE.exec(channel.name);
    if (match) highest = Math.max(highest, Number.parseInt(match[1], 10));
  }
  if (highest) ticketStore.ensureCounterAtLeast(highest);

  const setup = manager.checkSetup(guild, category);
  const lines = [
    setup.ok ? '✅ Sistem tiket siap.' : '⚠️ Sistem tiket belum siap.',
    `Kategori: <#${category.id}> (\`${category.name}\`)`,
    `Nomor berikutnya: \`ticket-${ticketStore.formatNumber(ticketStore.getCounter() + 1)}\``,
    `Staff terdeteksi: ${setup.staffRoles.length} role (punya Manage Channels)`,
  ];

  if (!setup.ok) lines.push('', '❌ Izin bot yang kurang:', `- ${setup.missing.join('\n- ')}`);
  if (setup.warnings.length) lines.push('', '⚠️ Catatan:', ...setup.warnings.map((w) => `- ${w}`));

  lines.push(
    '',
    'Langkah berikutnya:',
    '`/panel panel name:premium channel:#premium-panel` — kirim panel premium + tombol Beli Premium',
    'atau `/ticket panel` — panel "Buat Tiket" sederhana'
  );

  return edit(interaction, lines.join('\n'));
}

async function handlePanel(interaction) {
  const target = interaction.options.getChannel('channel') ?? interaction.channel;
  if (!target || !target.isTextBased() || !target.guild) {
    return edit(interaction, '❌ Channel tujuan tidak valid.');
  }

  const payload = panelPayload();
  const cfg = ticketStore.getConfig();

  if (cfg.panelMessageId && cfg.panelChannelId === target.id) {
    const existing = await target.messages.fetch(cfg.panelMessageId).catch(() => null);
    if (existing && existing.author.id === interaction.client.user.id) {
      await existing.edit(payload);
      return edit(interaction, `✅ Panel tiket diperbarui di ${target}.\n${existing.url}`);
    }
  }

  const sent = await target.send(payload).catch((err) => err);
  if (sent instanceof Error) return edit(interaction, `❌ Gagal mengirim panel: ${sent.message}`);

  ticketStore.setConfig({ panelChannelId: target.id, panelMessageId: sent.id });
  return edit(interaction, `✅ Panel tiket dikirim ke ${target}.\n${sent.url}`);
}

async function handleList(interaction) {
  const tickets = ticketStore.listTickets(interaction.guildId);
  if (!tickets.length) return edit(interaction, 'Belum ada tiket yang tercatat.');

  const lines = ['**Daftar Tiket**'];
  let stale = 0;

  for (const ticket of tickets.slice(0, 25)) {
    const channel = await manager.fetchChannel(interaction.client, ticket.channelId);
    if (!channel) {
      stale += 1;
      ticketStore.removeTicket(ticket.channelId);
      lines.push(`• #${ticketStore.formatNumber(ticket.number)} — \`channel hilang\` (dibersihkan)`);
      continue;
    }
    const status = ticket.status === 'open' ? '🟢 open' : '🔴 closed';
    lines.push(
      `• #${ticketStore.formatNumber(ticket.number)} — ${status} — <@${ticket.ownerId}> — ${channel}`
    );
  }

  if (tickets.length > 25) lines.push(`_…dan ${tickets.length - 25} tiket lainnya_`);
  if (stale) lines.push('', `🧹 ${stale} entry kosong dibersihkan.`);

  const counts = ticketStore.countByStatus(interaction.guildId);
  lines.push('', `Total: 🟢 ${counts.open} open · 🔴 ${counts.closed} closed`);

  return edit(interaction, lines.join('\n'));
}

async function handleInfo(interaction) {
  const guild = interaction.guild;
  const cfg = ticketStore.getConfig();
  const category = await manager.resolveCategory(guild);
  const setup = manager.checkSetup(guild, category);
  const counts = ticketStore.countByStatus(guild.id);

  const lines = [
    '**Sistem Tiket**',
    `Kategori: ${category ? `<#${category.id}> (\`${category.name}\`)` : '_belum diatur — jalankan `/ticket setup`_'}`,
    `Nomor berikutnya: \`ticket-${ticketStore.formatNumber(ticketStore.getCounter() + 1)}\``,
    `Tiket aktif: 🟢 ${counts.open} · 🔴 ${counts.closed}`,
    `Staff (Manage Channels): ${setup.staffRoles.length} role`,
    `Cooldown buat tiket: ${(config.ticket?.cooldownMs ?? 30000) / 1000}s`,
    `Ping role: ${config.ticket?.pingRoleId ? `<@&${config.ticket.pingRoleId}>` : '_tidak ada_'}`,
    `Panel: ${cfg.panelMessageId ? `<#${cfg.panelChannelId}>` : '_belum dikirim_'}`,
    `State file: \`${ticketStore.stateFilePath()}\``,
    '',
    setup.ok ? '✅ Bot punya izin yang dibutuhkan.' : `❌ Izin kurang: ${setup.missing.join(', ')}`,
  ];

  if (setup.warnings.length) lines.push(...setup.warnings.map((w) => `⚠️ ${w}`));

  return edit(interaction, lines.join('\n'));
}

module.exports = {
  data,

  async execute(interaction) {
    ticketStore.init();
    const sub = interaction.options.getSubcommand(true);
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      if (sub === 'setup') return await handleSetup(interaction);
      if (sub === 'panel') return await handlePanel(interaction);
      if (sub === 'list') return await handleList(interaction);
      if (sub === 'info') return await handleInfo(interaction);
      return edit(interaction, 'Subcommand tidak dikenal.');
    } catch (err) {
      return edit(interaction, `❌ ${err.message}`);
    }
  },
};
