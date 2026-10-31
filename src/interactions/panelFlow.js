'use strict';

const {
  FileUploadBuilder,
  LabelBuilder,
  MessageFlags,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');

const panelStore = require('../services/panelStore');
const assets = require('../services/assetStore');
const ticketManager = require('../services/ticketManager');
const { getUpdater } = require('../services/panelUpdater');
const { isOnCooldown } = require('../utils/cooldown');

const BUTTON_COOLDOWN_MS = 3000;
const MAX_BUTTONS = 25;
const MAX_SECTIONS = 25;
const MAX_REPLY_LENGTH = 1900;

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------
function textInput(customId, value, { paragraph = false, maxLength = 400, required = false } = {}) {
  const input = new TextInputBuilder()
    .setCustomId(customId)
    .setStyle(paragraph ? TextInputStyle.Paragraph : TextInputStyle.Short)
    .setRequired(required)
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

function replyEphemeral(interaction, content) {
  const payload = {
    content: String(content).slice(0, MAX_REPLY_LENGTH),
    flags: MessageFlags.Ephemeral,
    allowedMentions: { parse: [] },
  };
  if (interaction.deferred || interaction.replied) {
    return interaction.editReply(payload).catch(() => {});
  }
  return interaction.reply(payload).catch(() => {});
}

/** Balasan tombol: bungkus code block kalau user belum menulis fence sendiri. */
function formatReply(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed) return 'Teks balasan tombol ini belum diatur.';
  if (trimmed.includes('```')) return trimmed;
  return `\`\`\`\n${trimmed}\n\`\`\``;
}

function requireTextPanel(key) {
  const data = panelStore.getPanelData(key);
  if (!data) throw new Error(`Panel "${key}" tidak ditemukan.`);
  if (data.type !== 'text') throw new Error(`Panel "${key}" bukan panel teks.`);
  return data;
}

async function pickUpload(fields, customId, tag) {
  const uploaded = fields.getUploadedFiles(customId);
  if (!uploaded || uploaded.size === 0) return undefined;

  const attachment = [...uploaded.values()][0];
  if (!assets.isAllowedFile(attachment.name)) {
    throw new Error(`File "${attachment.name}" tidak didukung. Pakai PNG, JPG, WEBP, atau GIF.`);
  }

  const buffer = await assets.download(attachment.url);
  return assets.saveUpload(buffer, attachment.name, tag);
}

/**
 * Salin gambar yang sudah menempel di pesan panel ke disk, supaya penggantian
 * media tidak menghapus gambar lain yang masih dipakai.
 */
async function cacheMessageAssets(interaction, key) {
  const panel = panelStore.getPanel(key);
  const media = panelStore.getMedia(key) || {};
  if (!panel?.channelId || !panel?.messageId) return;

  const channel = await interaction.client.channels.fetch(panel.channelId).catch(() => null);
  if (!channel?.messages) return;

  const message = await channel.messages.fetch(panel.messageId).catch(() => null);
  if (!message) return;

  const byName = new Map([...message.attachments.values()].map((att) => [att.name, att]));
  for (const kind of panelStore.IMAGE_KINDS) {
    const fileName = media[`${kind}File`];
    if (!fileName || assets.exists(fileName)) continue;

    const attachment = byName.get(fileName);
    if (!attachment) continue;

    try {
      assets.write(fileName, await assets.download(attachment.url));
    } catch (err) {
      console.warn(`[panel:${key}] gagal menyalin aset ${fileName}: ${err.message}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Sinkronisasi isi panel
// ---------------------------------------------------------------------------
function parseButtonsText(raw, existing = []) {
  const lines = String(raw || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const previous = new Map(existing.map((button) => [button.label.toLowerCase(), button]));
  const buttons = [];

  for (const line of lines) {
    const parts = line.split('|').map((part) => part.trim());
    if (parts.length < 3) {
      throw new Error(
        `Baris "${line}" harus berformat "Label | emoji | link:https://url" atau "Label | emoji | reply".`
      );
    }

    const [label, emoji, action] = parts;
    if (!label) throw new Error(`Label tombol kosong pada baris "${line}".`);

    const prev = previous.get(label.toLowerCase());

    if (/^link:/i.test(action)) {
      const url = action.slice('link:'.length).trim();
      if (!/^https?:\/\/\S+$/i.test(url)) {
        throw new Error(`URL "${url}" tidak valid (harus diawali http:// atau https://).`);
      }
      buttons.push({ id: prev?.id || label, type: 'link', label, emoji, url });
    } else if (/^reply$/i.test(action)) {
      buttons.push({ id: prev?.id || label, type: 'reply', label, emoji, reply: prev?.reply ?? '' });
    } else if (/^ticket$/i.test(action)) {
      buttons.push({ id: prev?.id || label, type: 'ticket', label, emoji });
    } else {
      throw new Error(
        `Aksi "${action}" tidak dikenal. Pakai "link:URL", "reply", atau "ticket".`
      );
    }
  }

  if (buttons.length > MAX_BUTTONS) {
    throw new Error(`Maksimal ${MAX_BUTTONS} tombol (kamu mengirim ${buttons.length}).`);
  }

  return buttons;
}

function buttonsToText(buttons = []) {
  return buttons
    .map((button) => {
      if (button.type === 'link') return `${button.label} | ${button.emoji || ''} | link:${button.url}`;
      if (button.type === 'ticket') return `${button.label} | ${button.emoji || ''} | ticket`;
      return `${button.label} | ${button.emoji || ''} | reply`;
    })
    .join('\n');
}

// ---------------------------------------------------------------------------
// Modal
// ---------------------------------------------------------------------------
function openContentModal(interaction, key) {
  const data = requireTextPanel(key);
  const media = data.media || {};
  const content = data.content || {};

  const modal = new ModalBuilder().setCustomId(`panel:${key}:content:save`).setTitle('Isi Panel');
  modal.addLabelComponents(
    new LabelBuilder()
      .setLabel('Title')
      .setDescription('Judul besar embed')
      .setTextInputComponent(textInput('title', media.title, { maxLength: 256 })),
    new LabelBuilder()
      .setLabel('Description')
      .setDescription('Paragraf pembuka')
      .setTextInputComponent(textInput('description', content.description, { paragraph: true, maxLength: 2000 })),
    new LabelBuilder()
      .setLabel('Color')
      .setDescription('Hex, contoh #8B5CF6')
      .setTextInputComponent(textInput('color', media.color, { maxLength: 7 })),
    new LabelBuilder()
      .setLabel('Author Name')
      .setDescription('Teks kecil di atas judul')
      .setTextInputComponent(textInput('author_name', media.authorName, { maxLength: 100 }))
  );

  return interaction.showModal(modal);
}

function openMediaModal(interaction, key) {
  requireTextPanel(key);

  const modal = new ModalBuilder().setCustomId(`panel:${key}:media:save`).setTitle('Media Panel');
  modal.addLabelComponents(
    new LabelBuilder()
      .setLabel('Thumbnail')
      .setDescription('Gambar kecil di kanan atas — PNG/JPG/GIF')
      .setFileUploadComponent(fileInput('thumbnail')),
    new LabelBuilder()
      .setLabel('Banner')
      .setDescription('Gambar besar di bawah — boleh GIF animasi')
      .setFileUploadComponent(fileInput('banner')),
    new LabelBuilder()
      .setLabel('Author Icon')
      .setDescription('Ikon di samping author name')
      .setFileUploadComponent(fileInput('author_icon'))
  );

  return interaction.showModal(modal);
}

function openFooterModal(interaction, key) {
  const data = requireTextPanel(key);
  const media = data.media || {};

  const modal = new ModalBuilder().setCustomId(`panel:${key}:footer:save`).setTitle('Footer Panel');
  modal.addLabelComponents(
    new LabelBuilder()
      .setLabel('Footer Text')
      .setTextInputComponent(textInput('footer_text', media.footerText, { maxLength: 200 })),
    new LabelBuilder()
      .setLabel('Footer Icon')
      .setFileUploadComponent(fileInput('footer_icon'))
  );

  return interaction.showModal(modal);
}

function openSectionModal(interaction, key, mode, index = null) {
  const data = requireTextPanel(key);
  const sections = data.content?.sections || [];
  const existing = mode === 'edit' ? sections[index] : null;

  const modalId =
    mode === 'edit' ? `panel:${key}:section:edit:${index}` : `panel:${key}:section:add`;
  const modal = new ModalBuilder()
    .setCustomId(modalId)
    .setTitle(mode === 'edit' ? `Edit Bagian ${index + 1}` : 'Tambah Bagian');

  modal.addLabelComponents(
    new LabelBuilder()
      .setLabel('Emoji')
      .setDescription('Opsional, mis. 📜')
      .setTextInputComponent(textInput('emoji', existing?.emoji, { maxLength: 32 })),
    new LabelBuilder()
      .setLabel('Heading')
      .setDescription('Judul bagian, mis. How to Use')
      .setTextInputComponent(textInput('heading', existing?.heading, { maxLength: 200 })),
    new LabelBuilder()
      .setLabel('Body')
      .setDescription('Isi bagian — boleh multi-baris')
      .setTextInputComponent(textInput('body', existing?.body, { paragraph: true, maxLength: 2000 }))
  );

  return interaction.showModal(modal);
}

function openButtonsModal(interaction, key) {
  const data = requireTextPanel(key);
  const buttons = data.content?.buttons || [];

  const modal = new ModalBuilder().setCustomId(`panel:${key}:buttons:save`).setTitle('Tombol Panel');
  modal.addLabelComponents(
    new LabelBuilder()
      .setLabel('Tombol')
      .setDescription('Satu baris per tombol: Label | emoji | link:URL  ATAU  Label | emoji | reply')
      .setTextInputComponent(
        textInput('buttons', buttonsToText(buttons), { paragraph: true, maxLength: 2000 })
      )
  );

  return interaction.showModal(modal);
}

function openReplyModal(interaction, key, buttonId) {
  const data = requireTextPanel(key);
  const buttons = data.content?.buttons || [];
  const button = buttons.find((entry) => entry.id === buttonId);

  if (!button) throw new Error(`Tombol "${buttonId}" tidak ditemukan.`);
  if (button.type !== 'reply') {
    throw new Error(`Tombol "${button.label}" bertipe link, tidak punya teks balasan.`);
  }

  const modal = new ModalBuilder()
    .setCustomId(`panel:${key}:reply:save:${buttonId}`)
    .setTitle(`Balasan: ${button.label}`.slice(0, 45));

  modal.addLabelComponents(
    new LabelBuilder()
      .setLabel('Teks Balasan')
      .setDescription('Dikirim sebagai code block (kecuali sudah ada ```)')
      .setTextInputComponent(
        textInput('reply', button.reply, { paragraph: true, maxLength: 1900 })
      )
  );

  return interaction.showModal(modal);
}

// ---------------------------------------------------------------------------
// Modal submit
// ---------------------------------------------------------------------------
async function handlePanelModal(interaction) {
  panelStore.init();
  const parts = interaction.customId.split(':');
  const key = parts[1];
  const scope = parts[2];
  const action = parts[3];
  const extra = parts[4];
  const fields = interaction.fields;

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    if (scope === 'content') {
      const color = clean(fields.getTextInputValue('color'));
      if (color && !/^#[0-9a-fA-F]{6}$/.test(color)) {
        throw new Error('Warna harus format hex, contoh #8B5CF6.');
      }
      panelStore.setMedia(key, {
        title: clean(fields.getTextInputValue('title')),
        authorName: clean(fields.getTextInputValue('author_name')),
        color: color ?? null,
      });
      panelStore.setContent(key, { description: clean(fields.getTextInputValue('description')) });
    } else if (scope === 'media') {
      const patch = {};
      for (const [field, kind, tag] of [
        ['thumbnail', 'thumbnailFile', 'thumbnail'],
        ['banner', 'bannerFile', 'banner'],
        ['author_icon', 'authorIconFile', 'authoricon'],
      ]) {
        const fileName = await pickUpload(fields, field, tag);
        if (fileName !== undefined) patch[kind] = fileName;
      }
      if (!Object.keys(patch).length) {
        return interaction.editReply({ content: 'Tidak ada gambar yang diunggah.' });
      }
      await cacheMessageAssets(interaction, key);
      panelStore.setMedia(key, patch);
      assets.prune(panelStore.referencedAssetFiles());
    } else if (scope === 'footer') {
      const patch = { footerText: clean(fields.getTextInputValue('footer_text')) };
      const footerIcon = await pickUpload(fields, 'footer_icon', 'footericon');
      if (footerIcon !== undefined) patch.footerIconFile = footerIcon;
      await cacheMessageAssets(interaction, key);
      panelStore.setMedia(key, patch);
      assets.prune(panelStore.referencedAssetFiles());
    } else if (scope === 'section') {
      const section = {
        emoji: clean(fields.getTextInputValue('emoji')) ?? '',
        heading: clean(fields.getTextInputValue('heading')) ?? '',
        body: fields.getTextInputValue('body') ?? '',
      };
      if (!section.emoji && !section.heading && !section.body.trim()) {
        throw new Error('Bagian kosong: isi minimal heading atau body.');
      }

      const sections = [...(panelStore.getContent(key)?.sections || [])];
      if (action === 'edit') {
        const index = Number.parseInt(extra, 10);
        if (!Number.isInteger(index) || index < 0 || index >= sections.length) {
          throw new Error('Nomor bagian tidak valid.');
        }
        sections[index] = section;
      } else {
        if (sections.length >= MAX_SECTIONS) throw new Error(`Maksimal ${MAX_SECTIONS} bagian.`);
        sections.push(section);
      }
      panelStore.setContent(key, { sections });
    } else if (scope === 'buttons') {
      const raw = fields.getTextInputValue('buttons');
      const existing = panelStore.getContent(key)?.buttons || [];
      panelStore.setContent(key, { buttons: parseButtonsText(raw, existing) });
    } else if (scope === 'reply') {
      const buttons = [...(panelStore.getContent(key)?.buttons || [])];
      const index = buttons.findIndex((button) => button.id === extra);
      if (index === -1) throw new Error('Tombol tidak ditemukan lagi.');
      buttons[index] = { ...buttons[index], reply: fields.getTextInputValue('reply') ?? '' };
      panelStore.setContent(key, { buttons });
    } else {
      throw new Error('Jenis modal tidak dikenal.');
    }
  } catch (err) {
    return interaction.editReply({ content: `❌ ${err.message}` });
  }

  const result = await getUpdater(key).renderAndUpdate(interaction.client, { force: true });
  const tail = result.ok
    ? `Panel sudah di-update${result.created ? ' (pesan baru karena pesan lama hilang)' : ''}.`
    : `Tersimpan, tapi panel gagal di-update: ${result.reason}`;

  return interaction.editReply({ content: `✅ Tersimpan. ${tail}` });
}

// ---------------------------------------------------------------------------
// Tombol owner (konfirmasi hapus panel)
// ---------------------------------------------------------------------------
async function handlePanelButton(interaction) {
  panelStore.init();
  const [, key, scope, action] = interaction.customId.split(':');

  if (scope !== 'delete') return replyEphemeral(interaction, 'Aksi tidak dikenal.');

  if (action === 'cancel') {
    return interaction.update({ content: 'Dibatalkan. Panel tidak dihapus.', components: [] });
  }

  await interaction.deferUpdate();
  try {
    panelStore.deletePanel(key);
  } catch (err) {
    return interaction.editReply({ content: `❌ ${err.message}`, components: [] });
  }

  return interaction.editReply({
    content: `🗑️ Panel \`${key}\` dihapus dari bot. (Pesan di channel tidak ikut dihapus.)`,
    components: [],
  });
}

// ---------------------------------------------------------------------------
// Tombol publik (diklik member biasa)
// ---------------------------------------------------------------------------
async function handlePublicButton(interaction, key, buttonId) {
  try {
    panelStore.init();

    if (!panelStore.hasPanel(key)) {
      return replyEphemeral(interaction, 'Panel ini sudah tidak tersedia.');
    }

    const buttons = panelStore.getContent(key)?.buttons || [];
    const button = buttons.find((entry) => entry.id === buttonId);
    if (!button) return replyEphemeral(interaction, 'Tombol ini tidak tersedia.');

    // Tombol tiket: buat channel tiket privat.
    if (button.type === 'ticket') {
      const result = await ticketManager.openTicket(interaction, {
        topic: button.label,
        source: `panel:${key}`,
      });

      if (result.ok) return replyEphemeral(interaction, `🎫 Tiket kamu sudah dibuat: <#${result.channelId}>`);
      if (result.reason === 'already') {
        return replyEphemeral(interaction, `Kamu masih punya tiket yang belum selesai: <#${result.channelId}>`);
      }
      return replyEphemeral(interaction, `❌ ${result.reason}`);
    }

    if (button.type !== 'reply') {
      return replyEphemeral(interaction, 'Tombol ini tidak tersedia.');
    }

    if (isOnCooldown(`panelbtn:${interaction.user.id}:${key}:${buttonId}`, BUTTON_COOLDOWN_MS)) {
      return replyEphemeral(interaction, '⏳ Sabar ya, coba lagi sebentar lagi.');
    }

    return replyEphemeral(interaction, formatReply(button.reply));
  } catch (err) {
    console.error('Error tombol panel:', err);
    return replyEphemeral(interaction, 'Terjadi error. Coba lagi nanti.');
  }
}

// ---------------------------------------------------------------------------
// Autocomplete
// ---------------------------------------------------------------------------
async function handlePanelAutocomplete(interaction) {
  panelStore.init();
  const focused = interaction.options.getFocused(true);
  const value = String(focused.value || '').toLowerCase();

  if (focused.name === 'name') {
    const choices = panelStore
      .listPanels()
      .filter((key) => key.includes(value))
      .slice(0, 25)
      .map((key) => ({ name: key, value: key }));
    return interaction.respond(choices).catch(() => {});
  }

  if (focused.name === 'tombol') {
    const key = interaction.options.getString('name');
    const buttons = (key ? panelStore.getContent(key)?.buttons : []) || [];
    const choices = buttons
      .filter((button) => button.label.toLowerCase().includes(value))
      .slice(0, 25)
      .map((button) => ({
        name: `${button.emoji ? `${button.emoji} ` : ''}${button.label}`.slice(0, 100),
        value: button.id,
      }));
    return interaction.respond(choices).catch(() => {});
  }

  return interaction.respond([]).catch(() => {});
}

module.exports = {
  openContentModal,
  openMediaModal,
  openFooterModal,
  openSectionModal,
  openButtonsModal,
  openReplyModal,
  handlePanelModal,
  handlePanelButton,
  handlePublicButton,
  handlePanelAutocomplete,
  parseButtonsText,
  buttonsToText,
  cacheMessageAssets,
  replyEphemeral,
  formatReply,
  requireTextPanel,
};
