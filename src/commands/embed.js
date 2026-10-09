'use strict';

const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { createState } = require('../utils/embedState');
const { buildPanel } = require('../ui/embedPanel');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('embed')
    .setDescription('Buka panel pembuat embed (owner-only)'),

  async execute(interaction) {
    const state = createState(interaction.user.id);
    if (interaction.channelId) {
      state.channelId = interaction.channelId;
    }

    await interaction.reply({
      ...buildPanel(state, 'Panel siap.'),
      flags: MessageFlags.Ephemeral,
    });
  },
};