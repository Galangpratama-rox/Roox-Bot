'use strict';

const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { Client, Collection, GatewayIntentBits } = require('discord.js');
const config = require('./config');

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

client.commands = new Collection();

function loadCommands() {
  const commandsDir = path.join(__dirname, 'commands');
  const files = fs.readdirSync(commandsDir).filter((file) => file.endsWith('.js'));

  for (const file of files) {
    const command = require(path.join(commandsDir, file));
    if (command?.data?.name && typeof command.execute === 'function') {
      client.commands.set(command.data.name, command);
    } else {
      console.warn(`Lewati command tidak valid: ${file}`);
    }
  }
  console.log(`Memuat ${client.commands.size} command.`);
}

function loadEvents() {
  const eventsDir = path.join(__dirname, 'events');
  const files = fs.readdirSync(eventsDir).filter((file) => file.endsWith('.js'));

  for (const file of files) {
    const event = require(path.join(eventsDir, file));
    if (!event?.name || typeof event.execute !== 'function') {
      console.warn(`Lewati event tidak valid: ${file}`);
      continue;
    }
    if (event.once) {
      client.once(event.name, (...args) => event.execute(...args));
    } else {
      client.on(event.name, (...args) => event.execute(...args));
    }
  }
  console.log(`Memuat ${files.length} event.`);
}

function startHealthServer() {
  const port = process.env.PORT || 3000;
  const server = http.createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', uptime: process.uptime() }));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Roox BOT is running.');
  });

  server.on('error', (err) => {
    console.error('Health server error:', err.message);
  });

  server.listen(port, () => {
    console.log(`Health server berjalan di port ${port}.`);
  });
}

async function main() {
  loadCommands();
  loadEvents();
  startHealthServer();

  await client.login(config.token);
}

main().catch((err) => {
  console.error('Gagal menjalankan bot:', err);
  process.exit(1);
});

process.on('unhandledRejection', (err) => {
  console.error('Unhandled rejection:', err);
});