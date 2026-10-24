'use strict';

const { Events } = require('discord.js');
const { handleMessage } = require('../services/autoreply');

module.exports = {
  name: Events.MessageCreate,
  async execute(message) {
    try {
      await handleMessage(message);
    } catch (err) {
      console.error('[messageCreate] Error:', err);
    }
  },
};