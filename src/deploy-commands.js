'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { REST, Routes } = require('discord.js');
const config = require('./config');

function collectCommands() {
  const commandsDir = path.join(__dirname, 'commands');
  const files = fs.readdirSync(commandsDir).filter((file) => file.endsWith('.js'));
  return files.map((file) => require(path.join(commandsDir, file)).data.toJSON());
}

async function deploy() {
  const commands = collectCommands();
  const rest = new REST({ version: '10' }).setToken(config.token);

  const route = config.guildId
    ? Routes.applicationGuildCommands(config.clientId, config.guildId)
    : Routes.applicationCommands(config.clientId);

  const scope = config.guildId ? `guild ${config.guildId}` : 'global';

  console.log(`Mendaftarkan ${commands.length} command ke ${scope}...`);
  const data = await rest.put(route, { body: commands });
  console.log(`Berhasil mendaftarkan ${data.length} command.`);
}

deploy().catch((err) => {
  console.error('Gagal mendaftarkan command:', err);
  process.exit(1);
});