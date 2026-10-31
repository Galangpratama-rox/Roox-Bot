'use strict';

const { Events } = require('discord.js');
const panelStore = require('../services/panelStore');
const panelUpdater = require('../services/panelUpdater');
const ticketStore = require('../services/ticketStore');

module.exports = {
  name: Events.ClientReady,
  once: true,
  execute(client) {
    console.log(`Bot online sebagai ${client.user.tag} (${client.user.id})`);
    console.log(`Terhubung ke ${client.guilds.cache.size} server.`);

    // Pulihkan semua panel live (/games, panel teks, dst): baca state, adopsi
    // pesan pinned bila perlu, lalu render ulang supaya isinya sinkron.
    panelStore.init();
    ticketStore.init();
    panelUpdater.bootstrapAll(client).catch((err) => {
      console.error('[panel] gagal menyiapkan panel live:', err);
    });
  },
};
