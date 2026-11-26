'use strict';

const { InteractionContextType, MessageFlags, SlashCommandBuilder } = require('discord.js');
const seed = require('../data/newgame');
const { createState } = require('../utils/newgameState');
const { buildPanel } = require('../ui/newgamePanel');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('newgame')
    .setDescription('Buat & kirim pengumuman "New Game" (owner-only)')
    .setContexts(InteractionContextType.Guild),

  async execute(interaction) {
    const state = createState(interaction.user.id, {
      color: seed.color,
      script: seed.defaultScript,
    });
    if (interaction.channelId) state.targetChannelId = interaction.channelId;

    await interaction.reply({
      ...buildPanel(state, 'Panel siap.'),
      flags: MessageFlags.Ephemeral,
      allowedMentions: { parse: [] },
    });
  },
};
