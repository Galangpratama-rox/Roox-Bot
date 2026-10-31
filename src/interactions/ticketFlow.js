'use strict';

const { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags, PermissionFlagsBits } = require('discord.js');

const ticketStore = require('../services/ticketStore');
const manager = require('../services/ticketManager');

function ephemeral(interaction, content) {
  const payload = { content, flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } };
  if (interaction.deferred || interaction.replied) {
    return interaction.editReply(payload).catch(() => {});
  }
  return interaction.reply(payload).catch(() => {});
}

function isStaff(interaction) {
  return Boolean(interaction.member?.permissions?.has(PermissionFlagsBits.ManageChannels));
}

function confirmRow(channelId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`tk:${channelId}:confirm`)
      .setLabel('Ya, hapus tiket')
      .setEmoji('🗑️')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`tk:${channelId}:cancel`)
      .setLabel('Batal')
      .setStyle(ButtonStyle.Secondary)
  );
}

/**
 * Handler tombol tiket & tombol "buat tiket".
 * @param {import('discord.js').ButtonInteraction} interaction
 */
async function handleTicketButton(interaction) {
  try {
    ticketStore.init();
    const parts = interaction.customId.split(':');

    // Tombol pembuat tiket di panel mandiri `/ticket panel`.
    if (parts[0] === 'tkc') {
      const result = await manager.openTicket(interaction, { topic: 'Support', source: 'ticket-panel' });
      if (result.ok) return ephemeral(interaction, `🎫 Tiket kamu sudah dibuat: <#${result.channelId}>`);
      if (result.reason === 'already') {
        return ephemeral(interaction, `Kamu masih punya tiket yang belum selesai: <#${result.channelId}>`);
      }
      return ephemeral(interaction, `❌ ${result.reason}`);
    }

    if (parts[0] !== 'tk') return;

    const channelId = parts[1];
    const action = parts[2];

    const ticket = ticketStore.getTicket(channelId);
    if (!ticket) {
      return ephemeral(interaction, 'Tiket ini sudah tidak ada / sudah dihapus.');
    }

    if (action === 'close' || action === 'reopen') {
      if (interaction.user.id !== ticket.ownerId && !isStaff(interaction)) {
        return ephemeral(interaction, 'Hanya pembuat tiket atau staff yang bisa melakukan ini.');
      }

      const result = action === 'close'
        ? await manager.closeTicket(interaction, ticket)
        : await manager.reopenTicket(interaction, ticket);

      if (!result.ok) return ephemeral(interaction, `❌ ${result.reason}`);

      return ephemeral(
        interaction,
        action === 'close' ? '🔒 Tiket ditutup.' : '🔓 Tiket dibuka lagi.'
      );
    }

    if (action === 'delete') {
      if (!isStaff(interaction)) {
        return ephemeral(interaction, 'Hanya staff (Manage Channels) yang bisa menghapus tiket.');
      }
      return interaction
        .reply({
          content: '⚠️ Hapus tiket ini? Channel akan dihapus permanen.',
          components: [confirmRow(channelId)],
          flags: MessageFlags.Ephemeral,
        })
        .catch(() => {});
    }

    if (action === 'cancel') {
      return interaction.update({ content: 'Dibatalkan.', components: [] }).catch(() => {});
    }

    if (action === 'confirm') {
      if (!isStaff(interaction)) {
        return ephemeral(interaction, 'Hanya staff (Manage Channels) yang bisa menghapus tiket.');
      }

      await interaction.update({ content: '🗑️ Menghapus tiket...', components: [] }).catch(() => {});
      await manager.deleteTicket(interaction, ticket);
      return;
    }

    return ephemeral(interaction, 'Tombol tiket tidak dikenal.');
  } catch (err) {
    console.error('Error tombol tiket:', err);
    return ephemeral(interaction, 'Terjadi error saat memproses tiket.');
  }
}

module.exports = { handleTicketButton, isStaff };
