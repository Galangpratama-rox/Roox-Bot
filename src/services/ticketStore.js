'use strict';

const fs = require('node:fs');
const path = require('node:path');

const config = require('../config');

const STATE_VERSION = 1;
const SNOWFLAKE_RE = /^\d{17,20}$/;

let state = null;
let statePath = null;
let writing = false;
let dirty = false;
let pendingWrite = Promise.resolve();

function freshState() {
  return {
    version: STATE_VERSION,
    guildId: null,
    categoryId: null,
    categoryName: null,
    panelChannelId: null,
    panelMessageId: null,
    counter: 0,
    tickets: {},
  };
}

/** Nomor tiket jadi 4 digit: 69 -> "0069". */
function formatNumber(number) {
  const value = Number.isFinite(number) ? Math.max(0, Math.floor(number)) : 0;
  return String(value).padStart(4, '0');
}

function sanitizeTicket(channelId, raw) {
  if (!raw || typeof raw !== 'object') return null;

  const ownerId = raw.ownerId ? String(raw.ownerId) : null;
  if (!ownerId) return null;

  return {
    number: Number.isFinite(raw.number) ? Math.floor(raw.number) : null,
    guildId: raw.guildId ? String(raw.guildId) : null,
    channelId,
    ownerId,
    ownerTag: typeof raw.ownerTag === 'string' ? raw.ownerTag : null,
    topic: typeof raw.topic === 'string' ? raw.topic : null,
    source: typeof raw.source === 'string' ? raw.source : null,
    status: raw.status === 'closed' ? 'closed' : 'open',
    createdAt: Number.isFinite(raw.createdAt) ? raw.createdAt : Date.now(),
    closedAt: Number.isFinite(raw.closedAt) ? raw.closedAt : null,
    closedBy: raw.closedBy ? String(raw.closedBy) : null,
    welcomeMessageId: raw.welcomeMessageId ? String(raw.welcomeMessageId) : null,
  };
}

function sanitize(raw) {
  const base = freshState();
  if (!raw || typeof raw !== 'object') return base;

  const tickets = {};
  const rawTickets = raw.tickets && typeof raw.tickets === 'object' ? raw.tickets : {};
  for (const [channelId, value] of Object.entries(rawTickets)) {
    if (!SNOWFLAKE_RE.test(channelId)) continue;
    const ticket = sanitizeTicket(channelId, value);
    if (ticket) tickets[channelId] = ticket;
  }

  return {
    version: STATE_VERSION,
    guildId: raw.guildId ? String(raw.guildId) : null,
    categoryId: raw.categoryId ? String(raw.categoryId) : null,
    categoryName: typeof raw.categoryName === 'string' ? raw.categoryName : null,
    panelChannelId: raw.panelChannelId ? String(raw.panelChannelId) : null,
    panelMessageId: raw.panelMessageId ? String(raw.panelMessageId) : null,
    counter: Number.isFinite(raw.counter) && raw.counter >= 0 ? Math.floor(raw.counter) : 0,
    tickets,
  };
}

function resolveStatePath() {
  return path.join(path.resolve(config.dataDir), 'tickets.json');
}

function load() {
  try {
    fs.mkdirSync(path.dirname(statePath), { recursive: true });
  } catch (err) {
    console.error(`[ticket] gagal membuat folder data: ${err.message}`);
  }

  try {
    return sanitize(JSON.parse(fs.readFileSync(statePath, 'utf8')));
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.warn(`[ticket] state tidak bisa dibaca (${err.message}). Mulai dari kosong.`);
    }
    return freshState();
  }
}

function init() {
  if (state) return state;
  statePath = resolveStatePath();
  state = load();
  return state;
}

function getState() {
  return init();
}

/** Simpan atomic (tmp + rename) dan digabung agar tidak menulis berulang. */
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
      console.error(`[ticket] gagal menyimpan state: ${err.message}`);
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
// Konfigurasi (kategori)
// ---------------------------------------------------------------------------
function getConfig() {
  const data = init();
  return {
    guildId: data.guildId,
    categoryId: data.categoryId,
    categoryName: data.categoryName,
    panelChannelId: data.panelChannelId,
    panelMessageId: data.panelMessageId,
  };
}

function setConfig(patch = {}) {
  const data = init();
  if ('guildId' in patch) data.guildId = patch.guildId ?? null;
  if ('categoryId' in patch) data.categoryId = patch.categoryId ?? null;
  if ('categoryName' in patch) data.categoryName = patch.categoryName ?? null;
  if ('panelChannelId' in patch) data.panelChannelId = patch.panelChannelId ?? null;
  if ('panelMessageId' in patch) data.panelMessageId = patch.panelMessageId ?? null;
  save();
  return getConfig();
}

// ---------------------------------------------------------------------------
// Nomor tiket
// ---------------------------------------------------------------------------
function getCounter() {
  return init().counter;
}

function nextNumber() {
  const data = init();
  data.counter += 1;
  save();
  return data.counter;
}

/** Pastikan counter minimal sebesar nomor yang sudah terpakai di server. */
function ensureCounterAtLeast(number) {
  const data = init();
  if (!Number.isFinite(number) || number <= data.counter) return data.counter;
  data.counter = Math.floor(number);
  save();
  return data.counter;
}

// ---------------------------------------------------------------------------
// Tiket
// ---------------------------------------------------------------------------
function getTicket(channelId) {
  return init().tickets[channelId] ?? null;
}

function listTickets(guildId = null, status = null) {
  return Object.values(init().tickets)
    .filter((ticket) => (!guildId || ticket.guildId === guildId) && (!status || ticket.status === status))
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

function findOpenByOwner(guildId, ownerId) {
  return (
    Object.values(init().tickets).find(
      (ticket) => ticket.guildId === guildId && ticket.ownerId === ownerId && ticket.status === 'open'
    ) ?? null
  );
}

/**
 * @param {{ number: number, guildId: string, channelId: string, ownerId: string, ownerTag?: string, topic?: string|null, source?: string|null, status?: 'open'|'closed' }} record
 */
function createTicketRecord(record) {
  const data = init();
  const ticket = sanitizeTicket(record.channelId, { ...record, createdAt: Date.now() });
  data.tickets[record.channelId] = ticket;
  save();
  return ticket;
}

function updateTicket(channelId, patch = {}) {
  const data = init();
  const ticket = data.tickets[channelId];
  if (!ticket) return null;

  const merged = sanitizeTicket(channelId, { ...ticket, ...patch });
  data.tickets[channelId] = merged;
  save();
  return merged;
}

function removeTicket(channelId) {
  const data = init();
  if (!data.tickets[channelId]) return false;
  delete data.tickets[channelId];
  save();
  return true;
}

function countByStatus(guildId = null) {
  const summary = { open: 0, closed: 0 };
  for (const ticket of Object.values(init().tickets)) {
    if (guildId && ticket.guildId !== guildId) continue;
    summary[ticket.status] = (summary[ticket.status] || 0) + 1;
  }
  return summary;
}

module.exports = {
  init,
  save,
  getState,
  stateFilePath,
  getConfig,
  setConfig,
  getCounter,
  nextNumber,
  ensureCounterAtLeast,
  getTicket,
  listTickets,
  findOpenByOwner,
  createTicketRecord,
  updateTicket,
  removeTicket,
  countByStatus,
  formatNumber,
};
