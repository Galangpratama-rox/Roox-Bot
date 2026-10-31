'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const config = require('../config');
const gamesSeed = require('../data/games');
const panelsSeed = require('../data/panels');

const STATE_VERSION = 2;
const STATUS_KEYS = Object.keys(gamesSeed.statuses);
const KEY_RE = /^[a-z0-9_-]{1,32}$/;

// Urutan & nama field gambar panel (dipakai semua jenis panel).
const IMAGE_KINDS = ['thumbnail', 'banner', 'authorIcon', 'footerIcon'];

let state = null;
let statePath = null;
let writing = false;
let dirty = false;
let pendingWrite = Promise.resolve();
// Hash render terakhir per panel (hanya di memori) untuk anti edit berulang.
const lastHashes = new Map();

function newId() {
  return crypto.randomBytes(4).toString('hex');
}

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function slug(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);
}

function normalizeName(value) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeStatus(value) {
  const raw = String(value ?? '').trim().toLowerCase();
  return STATUS_KEYS.includes(raw) ? raw : gamesSeed.defaultStatus;
}

// ---------------------------------------------------------------------------
// Bentuk data default
// ---------------------------------------------------------------------------
function emptyPosition() {
  return { guildId: null, channelId: null, messageId: null, updatedAt: null, attachments: [] };
}

function emptyContent() {
  return { description: null, sections: [], buttons: [] };
}

function buildSeedGames() {
  return (gamesSeed.games || [])
    .map((entry) => (typeof entry === 'string' ? { name: entry } : entry))
    .filter((entry) => entry && normalizeName(entry.name))
    .map((entry) => ({
      id: newId(),
      name: normalizeName(entry.name),
      status: normalizeStatus(entry.status),
    }));
}

function defaultGamesPanel() {
  return {
    type: 'games',
    panel: emptyPosition(),
    media: { ...gamesSeed.media },
    games: buildSeedGames(),
  };
}

function defaultTextPanel(key) {
  const seed = panelsSeed.seedPanels[key];
  return {
    type: 'text',
    panel: emptyPosition(),
    media: { ...panelsSeed.textMediaDefaults, ...(seed?.media || {}) },
    content: clone(seed?.content) || emptyContent(),
  };
}

function defaultPanel(key) {
  if (key === 'games') return defaultGamesPanel();
  if (panelsSeed.seedPanels[key]) return defaultTextPanel(key);
  return null;
}

function freshState() {
  const panels = { games: defaultGamesPanel() };
  for (const key of Object.keys(panelsSeed.seedPanels)) {
    panels[key] = defaultTextPanel(key);
  }
  return { version: STATE_VERSION, panels, seedsApplied: allSeedKeys() };
}

function allSeedKeys() {
  return ['games', ...Object.keys(panelsSeed.seedPanels)];
}

// ---------------------------------------------------------------------------
// Validasi / normalisasi file state
// ---------------------------------------------------------------------------
function sanitizePosition(raw) {
  const input = raw && typeof raw === 'object' ? raw : {};
  return {
    guildId: input.guildId ? String(input.guildId) : null,
    channelId: input.channelId ? String(input.channelId) : null,
    messageId: input.messageId ? String(input.messageId) : null,
    updatedAt: Number.isFinite(input.updatedAt) ? input.updatedAt : null,
    attachments: Array.isArray(input.attachments)
      ? input.attachments
          .filter((name) => typeof name === 'string' && name.trim())
          .map((name) => name.trim())
      : [],
  };
}

function sanitizeMedia(defaults, raw) {
  const output = {};
  for (const key of Object.keys(defaults)) {
    const value = raw?.[key];
    if (value === null) output[key] = null;
    else if (typeof value === 'string') output[key] = value.trim() || null;
    else output[key] = defaults[key] ?? null;
  }
  return output;
}

function sanitizeGames(raw) {
  return (Array.isArray(raw) ? raw : [])
    .map((game) => {
      if (!game || !normalizeName(game.name)) return null;
      return {
        id: game.id ? String(game.id) : newId(),
        name: normalizeName(game.name),
        status: normalizeStatus(game.status),
      };
    })
    .filter(Boolean);
}

function sanitizeButtons(raw) {
  const list = Array.isArray(raw) ? raw : [];
  const used = new Set();
  const output = [];

  for (const button of list.slice(0, 25)) {
    if (!button || typeof button.label !== 'string' || !button.label.trim()) continue;

    const type =
      button.type === 'link' ? 'link' : button.type === 'ticket' ? 'ticket' : 'reply';
    let id = slug(button.id || button.label) || newId();
    if (used.has(id)) id = `${id}-${newId().slice(0, 4)}`;
    used.add(id);

    const entry = {
      id,
      type,
      label: button.label.trim().slice(0, 80),
      emoji: typeof button.emoji === 'string' ? button.emoji.trim().slice(0, 32) : '',
    };

    if (type === 'link') {
      if (!/^https?:\/\/\S+$/i.test(button.url || '')) continue;
      entry.url = String(button.url).trim();
    } else if (type === 'reply') {
      entry.reply = typeof button.reply === 'string' ? button.reply : '';
    }
    // tipe 'ticket' tidak butuh field tambahan.

    output.push(entry);
  }

  return output;
}

function sanitizeSections(raw) {
  return (Array.isArray(raw) ? raw : [])
    .map((section) => ({
      emoji: typeof section?.emoji === 'string' ? section.emoji.trim().slice(0, 32) : '',
      heading: typeof section?.heading === 'string' ? section.heading.trim().slice(0, 200) : '',
      body: typeof section?.body === 'string' ? section.body : '',
    }))
    .filter((section) => section.emoji || section.heading || section.body)
    .slice(0, 25);
}

function sanitizeContent(raw) {
  const input = raw && typeof raw === 'object' ? raw : {};
  return {
    description: typeof input.description === 'string' ? input.description : null,
    sections: sanitizeSections(input.sections),
    buttons: sanitizeButtons(input.buttons),
  };
}

function sanitizePanel(key, raw) {
  const fallback = defaultPanel(key);
  const input = raw && typeof raw === 'object' ? raw : {};
  const type = input.type === 'games' || key === 'games' ? 'games' : 'text';

  const mediaDefaults =
    type === 'games'
      ? gamesSeed.media
      : { ...panelsSeed.textMediaDefaults, ...(fallback?.media || {}) };

  const base = {
    type,
    panel: sanitizePosition(input.panel),
    media: sanitizeMedia(mediaDefaults, input.media),
  };

  if (type === 'games') {
    base.games = sanitizeGames(input.games ?? fallback?.games);
    return base;
  }

  base.content = sanitizeContent(input.content ?? panelsSeed.seedPanels[key]?.content ?? fallback?.content);
  return base;
}

function sanitizeV2(raw) {
  const panels = {};
  const rawPanels = raw?.panels && typeof raw.panels === 'object' ? raw.panels : {};

  for (const [key, value] of Object.entries(rawPanels)) {
    if (!KEY_RE.test(key)) continue;
    panels[key] = sanitizePanel(key, value);
  }

  // Panel /games adalah fitur inti: selalu ada.
  if (!panels.games) panels.games = defaultGamesPanel();

  // Seed yang sudah pernah diterapkan (dibuat sekali). Panel yang panel-nya
  // dihapus user tidak akan dibangkitkan lagi, tapi seed BARU dari update bot
  // tetap ikut dibuat sekali.
  const applied = new Set(Array.isArray(raw?.seedsApplied) ? raw.seedsApplied : []);
  let seedsAdded = false;

  for (const key of allSeedKeys()) {
    if (panels[key]) {
      applied.add(key);
      continue;
    }
    if (applied.has(key)) continue;
    if (panelsSeed.seedPanels[key]) panels[key] = defaultTextPanel(key);
    applied.add(key);
    seedsAdded = true;
  }

  return { value: { version: STATE_VERSION, panels, seedsApplied: [...applied] }, seedsAdded };
}

function looksLikeV1(parsed) {
  return Boolean(parsed && typeof parsed === 'object' && !parsed.panels && (parsed.panel || parsed.media || parsed.games));
}

// ---------------------------------------------------------------------------
// Baca / tulis file state
// ---------------------------------------------------------------------------
function resolveStatePath() {
  return path.join(path.resolve(config.dataDir), 'state.json');
}

function backupV1() {
  try {
    const backupPath = path.join(path.dirname(statePath), 'state.v1.bak.json');
    if (!fs.existsSync(backupPath)) fs.copyFileSync(statePath, backupPath);
    return true;
  } catch (err) {
    console.warn(`[panel] gagal membuat backup state lama: ${err.message}`);
    return false;
  }
}

function load() {
  try {
    fs.mkdirSync(path.dirname(statePath), { recursive: true });
  } catch (err) {
    console.error(`[panel] gagal membuat folder data: ${err.message}`);
  }

  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.warn(`[panel] state tidak bisa dibaca (${err.message}). Pakai data seed.`);
    }
    return { value: freshState(), migrated: false };
  }

  if (looksLikeV1(parsed)) {
    const backedUp = backupV1();
    console.log(
      `[panel] state lama dimigrasikan ke format multi-panel` +
        (backedUp ? ' (backup: state.v1.bak.json).' : '.')
    );
    const { value } = sanitizeV2({
      panels: { games: { type: 'games', panel: parsed.panel, media: parsed.media, games: parsed.games } },
    });
    return { value, migrated: true };
  }

  const { value, seedsAdded } = sanitizeV2(parsed);
  return { value, migrated: seedsAdded };
}

function init() {
  if (state) return state;
  statePath = resolveStatePath();
  const { value, migrated } = load();
  state = value;
  if (migrated) save();
  return state;
}

function getState() {
  return init();
}

/**
 * Simpan state atomic (tmp + rename) dan digabung, jadi beberapa mutasi
 * beruntun hanya menulis file sekali-dua kali dengan data terbaru.
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
      console.error(`[panel] gagal menyimpan state: ${err.message}`);
    } finally {
      writing = false;
    }
  })();

  return pendingWrite;
}

function stateFilePath() {
  init();
  return statePath;
}

// ---------------------------------------------------------------------------
// Akses data
// ---------------------------------------------------------------------------
function listPanels() {
  return Object.keys(init().panels);
}

function hasPanel(key) {
  return Boolean(init().panels[key]);
}

function getPanelData(key) {
  return init().panels[key] ?? null;
}

function requirePanel(key) {
  const panel = init().panels[key];
  if (!panel) throw new Error(`Panel "${key}" tidak ditemukan.`);
  return panel;
}

function getPanel(key) {
  return getPanelData(key)?.panel ?? null;
}

function getMedia(key) {
  return getPanelData(key)?.media ?? null;
}

function getContent(key) {
  return getPanelData(key)?.content ?? null;
}

function getGames(key = 'games') {
  return getPanelData(key)?.games ?? [];
}

function isValidKey(key) {
  return KEY_RE.test(String(key || ''));
}

/**
 * @param {string} key
 * @param {{ type?: 'text'|'games', media?: object, content?: object, games?: object[] }} [options]
 */
function createPanel(key, options = {}) {
  const clean = slug(key);
  if (!clean || !KEY_RE.test(clean)) {
    throw new Error('Nama panel harus huruf kecil/angka/tanda hubung, maksimal 32 karakter.');
  }
  if (hasPanel(clean)) throw new Error(`Panel "${clean}" sudah ada.`);

  const type = options.type === 'games' ? 'games' : 'text';
  const base = type === 'games' ? defaultGamesPanel() : defaultTextPanel(clean);

  init().panels[clean] = {
    type,
    panel: emptyPosition(),
    media: sanitizeMedia(base.media, options.media ?? base.media),
    ...(type === 'games'
      ? { games: sanitizeGames(options.games ?? base.games) }
      : { content: sanitizeContent(options.content ?? base.content) }),
  };

  save();
  return init().panels[clean];
}

function deletePanel(key) {
  if (!hasPanel(key)) throw new Error(`Panel "${key}" tidak ditemukan.`);
  delete init().panels[key];
  lastHashes.delete(key);
  save();
  return true;
}

/**
 * @param {string} key
 * @param {{ guildId?: string|null, channelId?: string|null, messageId?: string|null, attachments?: string[] }} patch
 * @param {number|null} [ts]
 */
function updatePanel(key, patch = {}, ts = Date.now()) {
  const panel = requirePanel(key).panel;
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

/**
 * @param {string} key
 * @param {Record<string, string|null>} patch
 */
function setMedia(key, patch) {
  const panel = requirePanel(key);
  for (const mediaKey of Object.keys(panel.media)) {
    if (!(mediaKey in patch)) continue;
    const value = patch[mediaKey];
    panel.media[mediaKey] = typeof value === 'string' ? value.trim() || null : value ?? null;
  }
  save();
  return panel.media;
}

/**
 * @param {string} key
 * @param {{ description?: string|null, sections?: object[], buttons?: object[] }} patch
 */
function setContent(key, patch) {
  const panel = requirePanel(key);
  if (panel.type !== 'text') throw new Error(`Panel "${key}" bukan panel teks.`);

  if ('description' in patch) {
    panel.content.description =
      typeof patch.description === 'string' ? patch.description.trim() || null : null;
  }
  if ('sections' in patch) panel.content.sections = sanitizeSections(patch.sections);
  if ('buttons' in patch) panel.content.buttons = sanitizeButtons(patch.buttons);

  save();
  return panel.content;
}

/**
 * Semua file gambar yang direferensikan panel mana pun (untuk prune aset).
 */
function referencedAssetFiles() {
  const files = new Set();
  for (const panel of Object.values(init().panels)) {
    for (const kind of IMAGE_KINDS) {
      const fileName = panel.media?.[`${kind}File`];
      if (fileName) files.add(fileName);
    }
  }
  return [...files];
}

function getLastHash(key) {
  return lastHashes.get(key) ?? null;
}

function setLastHash(key, hash) {
  lastHashes.set(key, hash);
}

module.exports = {
  IMAGE_KINDS,
  STATUS_KEYS,
  init,
  save,
  getState,
  stateFilePath,
  listPanels,
  hasPanel,
  isValidKey,
  getPanelData,
  getPanel,
  getMedia,
  getContent,
  getGames,
  createPanel,
  deletePanel,
  updatePanel,
  setMedia,
  setContent,
  referencedAssetFiles,
  getLastHash,
  setLastHash,
  slug,
  newId,
  normalizeName,
  normalizeStatus,
  sanitizeContent,
  sanitizeSections,
  sanitizeButtons,
  clone,
};