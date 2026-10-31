'use strict';

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  InteractionContextType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} = require('discord.js');

const panelsSeed = require('../data/panels');
const panelStore = require('../services/panelStore');
const { getUpdater } = require('../services/panelUpdater');
const panelFlow = require('../interactions/panelFlow');

const NAME_OPTION = (option, required = true) =>
  option
    .setName('name')
    .setDescription('Nama panel (ketik untuk mencari)')
    .setRequired(required)
    .setAutocomplete(true)
    .setMaxLength(32);

const REQUIRED_PERMS = [
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.SendMessages,
  PermissionFlagsBits.EmbedLinks,
];

const data = new SlashCommandBuilder()
  .setName('panel')
  .setDescription('Kelola panel teks live (owner-only)')
  .setContexts(InteractionContextType.Guild)
  .addSubcommand((sub) =>
    sub
      .setName('buat')
      .setDescription('Buat panel teks baru')
      .addStringOption((option) =>
        option
          .setName('name')
          .setDescription('Nama panel, huruf kecil/angka/tanda hubung')
          .setRequired(true)
          .setMaxLength(32)
      )
      .addStringOption((option) =>
        option
          .setName('template')
          .setDescription('Isi awal panel')
          .setRequired(false)
          .addChoices(
            { name: 'Kosong', value: 'kosong' },
            { name: 'Freemium (contoh lengkap)', value: 'freemium' },
            { name: 'Premium (info harga + tiket)', value: 'premium' }
          )
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName('panel')
      .setDescription('Kirim atau pulihkan panel di channel')
      .addStringOption((option) => NAME_OPTION(option))
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
      .setName('isi')
      .setDescription('Atur title, description, warna, author name')
      .addStringOption((option) => NAME_OPTION(option))
  )
  .addSubcommand((sub) =>
    sub
      .setName('bagian')
      .setDescription('Tambah / edit / hapus bagian (section)')
      .addStringOption((option) => NAME_OPTION(option))
      .addStringOption((option) =>
        option
          .setName('aksi')
          .setDescription('Yang dilakukan pada bagian')
          .setRequired(true)
          .addChoices(
            { name: 'Tambah', value: 'tambah' },
            { name: 'Edit', value: 'edit' },
            { name: 'Hapus', value: 'hapus' }
          )
      )
      .addIntegerOption((option) =>
        option
          .setName('nomor')
          .setDescription('Nomor bagian (untuk edit/hapus), lihat /panel info')
          .setRequired(false)
          .setMinValue(1)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName('tombol')
      .setDescription('Atur daftar tombol panel')
      .addStringOption((option) => NAME_OPTION(option))
  )
  .addSubcommand((sub) =>
    sub
      .setName('balasan')
      .setDescription('Atur teks balasan tombol bertipe reply')
      .addStringOption((option) => NAME_OPTION(option))
      .addStringOption((option) =>
        option
          .setName('tombol')
          .setDescription('Tombol yang mau diatur')
          .setRequired(true)
          .setAutocomplete(true)
          .setMaxLength(32)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName('media')
      .setDescription('Upload thumbnail, banner GIF, author icon')
      .addStringOption((option) => NAME_OPTION(option))
  )
  .addSubcommand((sub) =>
    sub
      .setName('footer')
      .setDescription('Atur teks & ikon footer')
      .addStringOption((option) => NAME_OPTION(option))
  )
  .addSubcommand((sub) =>
    sub
      .setName('refresh')
      .setDescription('Paksa render & edit panel sekarang')
      .addStringOption((option) => NAME_OPTION(option))
  )
  .addSubcommand((sub) =>
    sub
      .setName('info')
      .setDescription('Lihat isi & status panel')
      .addStringOption((option) => NAME_OPTION(option))
  )
  .addSubcommand((sub) =>
    sub
      .setName('hapus')
      .setDescription('Hapus panel dari bot (pesan di channel tetap ada)')
      .addStringOption((option) => NAME_OPTION(option))
  );

function edit(interaction, content) {
  return interaction.editReply({ content, allowedMentions: { parse: [] } });
}

function getKeyOrThrow(interaction) {
  const key = interaction.options.getString('name', true);
  if (!panelStore.hasPanel(key)) throw new Error(`Panel "${key}" tidak ditemukan.`);
  return key;
}

function panelLink(interaction, key, result) {
  const guildId = interaction.guildId;
  return `https://discord.com/channels/${guildId}/${result.channelId}/${result.messageId}`;
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------
async function handleBuat(interaction) {
  const name = interaction.options.getString('name', true);
  const template = interaction.options.getString('template') ?? 'kosong';
  const seed = panelsSeed.templates[template] ?? panelsSeed.templates.kosong;

  try {
    const key = panelStore.slug(name);
    panelStore.createPanel(key, { type: 'text', media: seed.media, content: seed.content });

    return edit(
      interaction,
      [
        `✅ Panel \`${key}\` dibuat (template: **${template}**).`,
        '',
        'Langkah berikutnya:',
        `1. \`/panel isi name:${key}\` — title, description, warna`,
        `2. \`/panel bagian name:${key} aksi:tambah\` — tambah section`,
        `3. \`/panel tombol name:${key}\` — atur tombol`,
        `4. \`/panel media name:${key}\` — upload thumbnail/banner`,
        `5. \`/panel panel name:${key}\` — kirim ke channel`,
      ].join('\n')
    );
  } catch (err) {
    return edit(interaction, `❌ ${err.message}`);
  }
}

async function handlePanelPost(interaction) {
  const key = getKeyOrThrow(interaction);
  const target = interaction.options.getChannel('channel') ?? interaction.channel;

  if (!target || !target.isTextBased() || !target.guild) {
    return edit(interaction, '❌ Channel tujuan tidak valid.');
  }

  const me = interaction.guild.members.me ?? (await interaction.guild.members.fetchMe().catch(() => null));
  const perms = me ? target.permissionsFor(me) : null;
  const missing = REQUIRED_PERMS.filter((perm) => !perms?.has(perm));
  if (missing.length) {
    return edit(
      interaction,
      `❌ Bot belum punya izin **View Channel / Send Messages / Embed Links** di ${target}.`
    );
  }

  const panel = panelStore.getPanel(key);
  const sameChannel = panel.channelId === target.id;
  const previous = { channelId: panel.channelId, messageId: panel.messageId };
  let adopted = { ok: false };
  let removedOld = false;

  if (!sameChannel) {
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

    panelStore.updatePanel(key, {
      guildId: target.guild.id,
      channelId: target.id,
      messageId: null,
      attachments: [],
    }, null);
    adopted = await getUpdater(key).adoptPinned(interaction.client, target.id);
  }

  const result = await getUpdater(key).renderAndUpdate(interaction.client, { force: true });
  if (!result.ok) return edit(interaction, `❌ Gagal: ${result.reason}`);

  const head = result.created
    ? '✅ Panel dibuat di'
    : adopted.ok
      ? '✅ Panel lama diadopsi & disinkronkan di'
      : '✅ Panel disinkronkan di';
  const tips = result.created
    ? '\n_Pesan sudah di-pin supaya bisa dipulihkan otomatis setelah restart._'
    : '';
  const moved = removedOld ? `\n🗑️ Panel lama di <#${previous.channelId}> dihapus.` : '';

  return edit(interaction, `${head} ${target}.\n${panelLink(interaction, key, result)}${tips}${moved}`);
}

async function handleBagianHapus(interaction, key) {
  const nomor = interaction.options.getInteger('nomor');
  const sections = [...(panelStore.getContent(key)?.sections || [])];

  if (!Number.isInteger(nomor) || nomor < 1 || nomor > sections.length) {
    return edit(interaction, `❌ Nomor bagian tidak valid. Panel ini punya ${sections.length} bagian.`);
  }

  const [removed] = sections.splice(nomor - 1, 1);
  panelStore.setContent(key, { sections });

  const result = await getUpdater(key).renderAndUpdate(interaction.client);
  const tail = result.ok
    ? '✅ Panel sudah di-update.'
    : `⚠️ Tersimpan, tapi panel gagal di-update: ${result.reason}`;

  return edit(
    interaction,
    `🗑️ Bagian ${nomor} (**${removed.heading || removed.emoji || 'tanpa judul'}**) dihapus.\n${tail}`
  );
}

async function handleRefresh(interaction) {
  const key = getKeyOrThrow(interaction);
  const result = await getUpdater(key).renderAndUpdate(interaction.client, { force: true });

  if (!result.ok) return edit(interaction, `❌ Gagal: ${result.reason}`);

  const extra = result.created ? '\n⚠️ Pesan lama tidak ditemukan, panel baru dikirim & di-pin.' : '';
  return edit(interaction, `✅ Panel di-refresh.\n${panelLink(interaction, key, result)}${extra}`);
}

async function handleInfo(interaction) {
  const key = getKeyOrThrow(interaction);
  const panelData = panelStore.getPanelData(key);
  const panel = panelData.panel;
  const media = panelData.media || {};
  const content = panelData.content || {};
  const sections = content.sections || [];
  const buttons = content.buttons || [];

  const messageRef = panel.messageId
    ? `https://discord.com/channels/${panel.guildId || interaction.guildId}/${panel.channelId}/${panel.messageId}`
    : '_belum ada_';

  const lines = [
    `**Panel \`${key}\`** (tipe: ${panelData.type})`,
    `Channel: ${panel.channelId ? `<#${panel.channelId}>` : '_belum diset_'}`,
    `Pesan: ${messageRef}`,
    `Update terakhir: ${panel.updatedAt ? `<t:${Math.floor(panel.updatedAt / 1000)}:R>` : '_belum pernah_'}`,
    '',
    `**Bagian (${sections.length})**`,
    ...(sections.length
      ? sections.map((section, index) => `${index + 1}. ${[section.emoji, section.heading].filter(Boolean).join(' ') || '_tanpa judul_'}`)
      : ['_belum ada_']),
    '',
    `**Tombol (${buttons.length})**`,
    ...(buttons.length
      ? buttons.map(
          (button) =>
            `• ${button.emoji ? `${button.emoji} ` : ''}${button.label} \`[${button.type}${button.type === 'reply' && !button.reply ? ', belum ada teks' : ''}]\``
        )
      : ['_belum ada_']),
    '',
    `Gambar: thumbnail ${media.thumbnailFile ? '✓' : '✗'} · banner ${media.bannerFile ? '✓' : '✗'} · author ${media.authorIconFile ? '✓' : '✗'} · footer ${media.footerIconFile ? '✓' : '✗'}`,
    `State file: \`${panelStore.stateFilePath()}\``,
  ];

  return edit(interaction, lines.join('\n'));
}

async function handleHapus(interaction) {
  const key = getKeyOrThrow(interaction);
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`panel:${key}:delete:confirm`)
      .setLabel('Ya, hapus panel')
      .setEmoji('🗑️')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`panel:${key}:delete:cancel`)
      .setLabel('Batal')
      .setStyle(ButtonStyle.Secondary)
  );

  return interaction.editReply({
    content: `⚠️ Hapus panel \`${key}\` dari bot? Pesan di channel tidak ikut terhapus.\n_Kamu bisa buat lagi dengan \`/panel buat\`._`,
    components: [row],
  });
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------
module.exports = {
  data,

  async execute(interaction) {
    panelStore.init();
    const sub = interaction.options.getSubcommand(true);

    // Modal harus jadi respons pertama, jadi jangan defer dulu.
    try {
      if (sub === 'isi') return panelFlow.openContentModal(interaction, getKeyOrThrow(interaction));
      if (sub === 'media') return panelFlow.openMediaModal(interaction, getKeyOrThrow(interaction));
      if (sub === 'footer') return panelFlow.openFooterModal(interaction, getKeyOrThrow(interaction));
      if (sub === 'tombol') return panelFlow.openButtonsModal(interaction, getKeyOrThrow(interaction));
      if (sub === 'balasan') {
        const key = getKeyOrThrow(interaction);
        const buttonId = interaction.options.getString('tombol', true);
        return panelFlow.openReplyModal(interaction, key, buttonId);
      }
      if (sub === 'bagian') {
        const aksi = interaction.options.getString('aksi', true);
        if (aksi !== 'hapus') {
          const key = getKeyOrThrow(interaction);
          const nomor = interaction.options.getInteger('nomor');
          if (aksi === 'edit') {
            const sections = panelStore.getContent(key)?.sections || [];
            if (!Number.isInteger(nomor) || nomor < 1 || nomor > sections.length) {
              await interaction.reply({
                content: `❌ Nomor bagian tidak valid. Panel ini punya ${sections.length} bagian (lihat \`/panel info\`).`,
                flags: MessageFlags.Ephemeral,
              });
              return;
            }
            return panelFlow.openSectionModal(interaction, key, 'edit', nomor - 1);
          }
          return panelFlow.openSectionModal(interaction, key, 'add');
        }
      }
    } catch (err) {
      return interaction
        .reply({ content: `❌ ${err.message}`, flags: MessageFlags.Ephemeral })
        .catch(() => {});
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      if (sub === 'buat') return await handleBuat(interaction);
      if (sub === 'panel') return await handlePanelPost(interaction);
      if (sub === 'bagian') {
        const key = getKeyOrThrow(interaction);
        return await handleBagianHapus(interaction, key);
      }
      if (sub === 'refresh') return await handleRefresh(interaction);
      if (sub === 'info') return await handleInfo(interaction);
      if (sub === 'hapus') return await handleHapus(interaction);
      return edit(interaction, 'Subcommand tidak dikenal.');
    } catch (err) {
      return edit(interaction, `❌ ${err.message}`);
    }
  },
};
