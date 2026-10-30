'use strict';

const { Events } = require('discord.js');
const gameStore = require('../services/gameStore');
const panelUpdater = require('../services/panelUpdater');

module.exports = {
  name: Events.ClientReady,
  once: true,
  execute(client) {
    console.log(`Bot online sebagai ${client.user.tag} (${client.user.id})`);
    console.log(`Terhubung ke ${client.guilds.cache.size} server.`);

    // Pulihkan panel live /games: baca state, adopsi pesan pinned bila perlu,
    // lalu render ulang supaya isinya sinkron setelah restart/redeploy.
    gameStore.init();
    panelUpdater.bootstrap(client).catch((err) => {
      console.error('[games] gagal menyiapkan panel live:', err);
    });
  },
};
