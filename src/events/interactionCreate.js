'use strict';

const { Events, MessageFlags } = require('discord.js');
const { isOwner } = require('../utils/isOwner');
const { handleButton, handleModalSubmit } = require('../interactions/embedFlow');

function parseCustomId(customId) {
  const parts = customId.split(':');
  if (parts[0] !== 'embed' || parts.length < 3) return null;
  return { pid: parts[1], rest: parts.slice(2) };
}

module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction) {
    if (!isOwner(interaction.user.id)) {
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
      if (interaction.isChatInputCommand()) {
        const command = interaction.client.commands.get(interaction.commandName);
        if (!command) {
          console.warn(`Command tidak ditemukan: ${interaction.commandName}`);
          return;
        }
        return await command.execute(interaction);
      }

      if (interaction.isButton()) {
        const parsed = parseCustomId(interaction.customId);
        if (!parsed) return;
        return await handleButton(interaction, parsed.pid, parsed.rest.join(':'));
      }

      if (interaction.isModalSubmit()) {
        const parts = interaction.customId.split(':');
        if (parts[0] !== 'embed' || parts[2] !== 'submit') return;
        return await handleModalSubmit(interaction, parts[1], parts.slice(3).join(':'));
      }
    } catch (err) {
      console.error('Error menangani interaksi:', err);
      const content = `Terjadi error: ${err.message}`;
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({ content }).catch(() => {});
      } else if (interaction.isRepliable()) {
        await interaction.reply({ content, flags: MessageFlags.Ephemeral }).catch(() => {});
      }
    }
  },
};