'use strict';

// Adapter tipis untuk panel "games" di atas panelStore (state multi-panel).
// API-nya sengaja dipertahankan supaya command `/games` tidak perlu berubah.

const panelStore = require('./panelStore');
const seed = require('../data/games');

const GAMES_KEY = 'games';

const normalizeName = panelStore.normalizeName;
const normalizeStatus = panelStore.normalizeStatus;

function init() {
  return panelStore.init();
}

function save() {
  return panelStore.save();
}

function getState() {
  return panelStore.getPanelData(GAMES_KEY);
}

function getPanel() {
  return panelStore.getPanel(GAMES_KEY);
}

function getMedia() {
  return panelStore.getMedia(GAMES_KEY);
}

function stateFilePath() {
  return panelStore.stateFilePath();
}

function games() {
  return panelStore.getGames(GAMES_KEY);
}

function getGames() {
  return games();
}

function findGame(query) {
  const target = normalizeName(query).toLowerCase();
  if (!target) return null;

  const list = games();
  return (
    list.find((game) => game.name.toLowerCase() === target) ||
    list.find((game) => game.name.toLowerCase().startsWith(target)) ||
    list.find((game) => game.name.toLowerCase().includes(target)) ||
    null
  );
}

function searchGames(query, limit = 25) {
  const target = normalizeName(query).toLowerCase();
  const words = target.split(' ').filter(Boolean);

  return games()
    .map((game) => {
      const name = game.name.toLowerCase();
      let score = 0;
      if (!target) score = 1;
      else if (name === target) score = 100;
      else if (name.startsWith(target)) score = 80;
      else if (name.includes(target)) score = 60;
      else if (words.length && words.every((word) => name.includes(word))) score = 30;
      return { game, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((entry) => entry.game);
}

function statusSummary() {
  const summary = {};
  for (const key of Object.keys(seed.statuses)) summary[key] = 0;
  for (const game of games()) {
    summary[game.status] = (summary[game.status] || 0) + 1;
  }
  return summary;
}

function validateName(name) {
  const clean = normalizeName(name);
  if (!clean) throw new Error('Nama game tidak boleh kosong.');
  if (clean.length > 100) throw new Error('Nama game maksimal 100 karakter.');
  return clean;
}

function assertUniqueName(clean, exceptId = null) {
  const lower = clean.toLowerCase();
  const duplicate = games().find(
    (game) => game.id !== exceptId && game.name.toLowerCase() === lower
  );
  if (duplicate) throw new Error(`Game "${duplicate.name}" sudah ada di daftar.`);
}

function addGame(name, status) {
  const clean = validateName(name);
  assertUniqueName(clean);

  const game = { id: panelStore.newId(), name: clean, status: normalizeStatus(status) };
  games().push(game);
  save();
  return game;
}

function setStatus(query, status) {
  const game = findGame(query);
  if (!game) throw new Error(`Game "${query}" tidak ditemukan.`);

  const before = game.status;
  game.status = normalizeStatus(status);
  save();
  return { game, before };
}

function renameGame(query, newName) {
  const game = findGame(query);
  if (!game) throw new Error(`Game "${query}" tidak ditemukan.`);

  const clean = validateName(newName);
  assertUniqueName(clean, game.id);

  const before = game.name;
  game.name = clean;
  save();
  return { game, before };
}

function removeGame(query) {
  const game = findGame(query);
  if (!game) throw new Error(`Game "${query}" tidak ditemukan.`);

  const list = games();
  list.splice(list.indexOf(game), 1);
  save();
  return game;
}

function setMedia(patch) {
  return panelStore.setMedia(GAMES_KEY, patch);
}

function updatePanel(patch = {}, ts = Date.now()) {
  return panelStore.updatePanel(GAMES_KEY, patch, ts);
}

function syncFromSeed() {
  const panel = panelStore.getPanelData(GAMES_KEY);
  panel.games = (seed.games || [])
    .map((entry) => (typeof entry === 'string' ? { name: entry } : entry))
    .filter((entry) => entry && normalizeName(entry.name))
    .map((entry) => ({
      id: panelStore.newId(),
      name: normalizeName(entry.name),
      status: normalizeStatus(entry.status),
    }));
  save();
  return panel.games;
}

function getLastHash() {
  return panelStore.getLastHash(GAMES_KEY);
}

function setLastHash(hash) {
  panelStore.setLastHash(GAMES_KEY, hash);
}

module.exports = {
  GAMES_KEY,
  init,
  save,
  getState,
  getPanel,
  getMedia,
  stateFilePath,
  getGames,
  findGame,
  searchGames,
  statusSummary,
  addGame,
  setStatus,
  renameGame,
  removeGame,
  setMedia,
  updatePanel,
  syncFromSeed,
  normalizeName,
  normalizeStatus,
  getLastHash,
  setLastHash,
  statusKeys: Object.keys(seed.statuses),
  mediaKeys: Object.keys(seed.media),
};
