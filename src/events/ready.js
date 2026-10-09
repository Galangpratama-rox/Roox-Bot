'use strict';

const { Events } = require('discord.js');

module.exports = {
  name: Events.ClientReady,
  once: true,
  execute(client) {
    console.log(`Bot online sebagai ${client.user.tag} (${client.user.id})`);
    console.log(`Terhubung ke ${client.guilds.cache.size} server.`);
  },
};