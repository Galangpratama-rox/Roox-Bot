'use strict';

const { Events, MessageFlags } = require('discord.js');
const { isOwner } = require('../utils/isOwner');
const { handleButton, handleModalSubmit } = require('../interactions/embedFlow');
const gamesFlow = require('../interactions/gamesFlow');
const panelFlow = require('../interactions/panelFlow');
const ticketFlow = require('../interactions/ticketFlow');

function parseCustomId(customId) {
  const parts = customId.split(':');
  if (parts[0] !== 'embed' || parts.length < 3) return null;
  return { pid: parts[1], rest: parts.slice(2) };
}

module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction) {
    // Tombol aksi panel (mis. "Get Script") boleh diklik siapa saja, bukan cuma owner.
    if (interaction.isButton() && interaction.customId.startsWith('pnl:')) {
      const [, key, scope, buttonId] = interaction.customId.split(':');
      if (scope === 'b') {
        return panelFlow.handlePublicButton(interaction, key, buttonId);
      }
      return;
    }

    // Tombol sistem tiket (buat/tutup/buka/hapus) juga publik, dengan cek izin sendiri.
    if (interaction.isButton() && (interaction.customId.startsWith('tk:') || interaction.customId.startsWith('tkc:'))) {
      return ticketFlow.handleTicketButton(interaction);
    }

    if (!isOwner(interaction.user.id)) {
      // Autocomplete tidak bisa dibalas pesan biasa: cukup kosongkan pilihan.
      if (interaction.isAutocomplete()) {
        await interaction.respond([]).catch(() => {});
        return;
      }
      const payload = {
        content: 'Kamu tidak punya akses untuk memakai bot ini.',
        flags: MessageFlags.Ephemeral,
      };
      if (interaction.isRepliable()) {
        await (interaction.deferred || interaction.replied
          ? interaction.followUp(payload)
          : interaction.reply(payload)
        ).catch(() => {});
      }
      return;
    }

    try {
      if (interaction.isAutocomplete()) {
        if (interaction.commandName === 'games') {
          return await gamesFlow.handleGamesAutocomplete(interaction);
        }
        if (interaction.commandName === 'panel') {
          return await panelFlow.handlePanelAutocomplete(interaction);
        }
        return await interaction.respond([]).catch(() => {});
      }

      if (interaction.isChatInputCommand()) {
        const command = interaction.client.commands.get(interaction.commandName);
        if (!command) {
          console.warn(`Command tidak ditemukan: ${interaction.commandName}`);
          return;
        }
        return await command.execute(interaction);
      }

      if (interaction.isButton()) {
        if (interaction.customId.startsWith('panel:')) {
          return await panelFlow.handlePanelButton(interaction);
        }
        if (interaction.customId.startsWith('games:')) {
          return await gamesFlow.handleGamesButton(interaction);
        }
        const parsed = parseCustomId(interaction.customId);
        if (!parsed) return;
        return await handleButton(interaction, parsed.pid, parsed.rest.join(':'));
      }

      if (interaction.isModalSubmit()) {
        if (interaction.customId.startsWith('panel:')) {
          return await panelFlow.handlePanelModal(interaction);
        }
        if (interaction.customId.startsWith('games:')) {
          return await gamesFlow.handleGamesModal(interaction);
        }
        const parts = interaction.customId.split(':');
        if (parts[0] !== 'embed' || parts[2] !== 'submit') return;
        return await handleModalSubmit(interaction, parts[1], parts.slice(3).join(':'));
      }
    } catch (err) {
      console.error('Error menangani interaksi:', err);
      if (interaction.isAutocomplete()) return;
      const content = `Terjadi error: ${err.message}`;
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({ content }).catch(() => {});
      } else if (interaction.isRepliable()) {
        await interaction.reply({ content, flags: MessageFlags.Ephemeral }).catch(() => {});
      }
    }
  },
};
