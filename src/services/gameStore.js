'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const config = require('../config');
const seed = require('../data/games');

const STATE_VERSION = 1;
const STATUS_KEYS = Object.keys(seed.statuses);
const MEDIA_KEYS = Object.keys(seed.media);

let state = null;
let statePath = null;
let writing = false;
let dirty = false;
let pendingWrite = Promise.resolve();
// Hash render terakhir, hanya di memori: dipakai agar edit pesan tidak
// dikirim kalau isi embed tidak berubah.
let lastHash = null;

function newId() {
  return crypto.randomBytes(4).toString('hex');
}

function normalizeName(value) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeStatus(value) {
  const raw = String(value ?? '').trim().toLowerCase();
  return STATUS_KEYS.includes(raw) ? raw : seed.defaultStatus;
}

function defaultMedia() {
  return { ...seed.media };
}

function buildSeedGames() {
  return (seed.games || [])
    .map((entry) => (typeof entry === 'string' ? { name: entry } : entry))
    .filter((entry) => entry && normalizeName(entry.name))
    .map((entry) => ({
      id: newId(),
      name: normalizeName(entry.name),
      status: normalizeStatus(entry.status),
    }));
}

function freshState() {
  return {
    version: STATE_VERSION,
    panel: { guildId: null, channelId: null, messageId: null, updatedAt: null, attachments: [] },
    media: defaultMedia(),
    games: buildSeedGames(),
  };
}

function pickMedia(raw) {
  const out = {};
  for (const key of MEDIA_KEYS) {
    const value = raw?.[key];
    if (value === null) out[key] = null;
    else if (typeof value === 'string') out[key] = value.trim() || null;
  }
  return out;
}

/**
 * Pastikan bentuk state selalu valid, apapun isi file di disk.
 * @param {unknown} raw
 */
function sanitize(raw) {
  const base = freshState();
  if (!raw || typeof raw !== 'object') return base;

  const rawPanel = raw.panel && typeof raw.panel === 'object' ? raw.panel : {};
  const rawGames = Array.isArray(raw.games) ? raw.games : base.games;

  return {
    version: STATE_VERSION,
    panel: {
      guildId: rawPanel.guildId ? String(rawPanel.guildId) : null,
      channelId: rawPanel.channelId ? String(rawPanel.channelId) : null,
      messageId: rawPanel.messageId ? String(rawPanel.messageId) : null,
      updatedAt: Number.isFinite(rawPanel.updatedAt) ? rawPanel.updatedAt : null,
      attachments: Array.isArray(rawPanel.attachments)
        ? rawPanel.attachments.filter((name) => typeof name === 'string' && name.trim()).map((name) => name.trim())
        : [],
    },
    media: { ...defaultMedia(), ...pickMedia(raw.media) },
    games: rawGames
      .map((game) => {
        if (!game || !normalizeName(game.name)) return null;
        return {
          id: game.id ? String(game.id) : newId(),
          name: normalizeName(game.name),
          status: normalizeStatus(game.status),
        };
      })
      .filter(Boolean),
  };
}

function resolveStatePath() {
  return path.join(path.resolve(config.dataDir), 'state.json');
}

function load() {
  try {
    fs.mkdirSync(path.dirname(statePath), { recursive: true });
  } catch (err) {
    console.error(`[games] gagal membuat folder data: ${err.message}`);
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    return sanitize(parsed);
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.warn(`[games] state tidak bisa dibaca (${err.message}). Pakai data seed.`);
    }
    return freshState();
  }
}

/**
 * Muat state dari disk (idempotent). Wajib dipanggil sekali saat bot ready.
 */
function init() {
  if (state) return state;
  statePath = resolveStatePath();
  state = load();
  return state;
}

function getState() {
  return init();
}

/**
 * Simpan state ke disk: atomic (tmp + rename) dan digabung, jadi beberapa
 * mutasi beruntun hanya menulis file satu-dua kali, selalu dengan data terbaru.
 */
function save() {
  init();

  if (writing) {
    dirty = true;
    return pendingWrite;
  }

  writing = true;
  pendingWrite = (async () => {
    try {
      do {
        dirty = false;
        const snapshot = JSON.stringify(state, null, 2);
        const tmp = `${statePath}.tmp`;
        await fs.promises.writeFile(tmp, snapshot, 'utf8');
        await fs.promises.rename(tmp, statePath);
      } while (dirty);
    } catch (err) {
      console.error(`[games] gagal menyimpan state: ${err.message}`);
    } finally {
      writing = false;
    }
  })();

  return pendingWrite;
}

function getGames() {
  return init().games;
}

function getPanel() {
  return init().panel;
}

function getMedia() {
  return init().media;
}

function stateFilePath() {
  init();
  return statePath;
}

/**
 * Cari game: cocok persis -> awalan -> mengandung.
 * @param {string} query
 */
function findGame(query) {
  const target = normalizeName(query).toLowerCase();
  if (!target) return null;

  const games = init().games;
  return (
    games.find((game) => game.name.toLowerCase() === target) ||
    games.find((game) => game.name.toLowerCase().startsWith(target)) ||
    games.find((game) => game.name.toLowerCase().includes(target)) ||
    null
  );
}

/**
 * Kandidat untuk autocomplete.
 * @param {string} query
 * @param {number} [limit]
 */
function searchGames(query, limit = 25) {
  const target = normalizeName(query).toLowerCase();
  const words = target.split(' ').filter(Boolean);

  return init()
    .games.map((game) => {
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
  for (const key of STATUS_KEYS) summary[key] = 0;
  for (const game of init().games) {
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
  const duplicate = init().games.find(
    (game) => game.id !== exceptId && game.name.toLowerCase() === lower
  );
  if (duplicate) throw new Error(`Game "${duplicate.name}" sudah ada di daftar.`);
}

/**
 * @param {string} name
 * @param {string} [status]
 */
function addGame(name, status) {
  const clean = validateName(name);
  assertUniqueName(clean);

  const game = { id: newId(), name: clean, status: normalizeStatus(status) };
  init().games.push(game);
  save();
  return game;
}

/**
 * @param {string} query
 * @param {string} status
 */
function setStatus(query, status) {
  const game = findGame(query);
  if (!game) throw new Error(`Game "${query}" tidak ditemukan.`);

  const before = game.status;
  game.status = normalizeStatus(status);
  save();
  return { game, before };
}

/**
 * @param {string} query
 * @param {string} newName
 */
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

/**
 * @param {string} query
 */
function removeGame(query) {
  const game = findGame(query);
  if (!game) throw new Error(`Game "${query}" tidak ditemukan.`);

  const games = init().games;
  games.splice(games.indexOf(game), 1);
  save();
  return game;
}

/**
 * @param {Record<string, string|null>} patch
 */
function setMedia(patch) {
  const media = init().media;
  for (const key of MEDIA_KEYS) {
    if (!(key in patch)) continue;
    const value = patch[key];
    media[key] = typeof value === 'string' ? value.trim() || null : value ?? null;
  }
  save();
  return media;
}

/**
 * Simpan posisi pesan panel. `updatedAt` diisi bila ts diberikan.
 * @param {{ guildId?: string|null, channelId?: string|null, messageId?: string|null, attachments?: string[] }} patch
 * @param {number|null} [ts]
 */
function updatePanel(patch = {}, ts = Date.now()) {
  const panel = init().panel;
  if ('guildId' in patch) panel.guildId = patch.guildId ?? null;
  if ('channelId' in patch) panel.channelId = patch.channelId ?? null;
  if ('messageId' in patch) panel.messageId = patch.messageId ?? null;
  if ('attachments' in patch) {
    panel.attachments = Array.isArray(patch.attachments) ? patch.attachments.filter(Boolean) : [];
  }
  if (ts) panel.updatedAt = ts;
  save();
  return panel;
}

function syncFromSeed() {
  state.games = buildSeedGames();
  save();
  return state.games;
}

function getLastHash() {
  return lastHash;
}

function setLastHash(hash) {
  lastHash = hash;
}

module.exports = {
  init,
  save,
  getState,
  getGames,
  getPanel,
  getMedia,
  stateFilePath,
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
  statusKeys: STATUS_KEYS,
  mediaKeys: MEDIA_KEYS,
};
