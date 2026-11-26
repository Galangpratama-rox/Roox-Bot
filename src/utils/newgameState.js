'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const config = require('../config');

// Sesi disimpan di disk (data/newgame) supaya tidak hilang saat bot restart
// (mis. nodemon menyimpan file) atau proses baru. Kalau file juga hilang
// (redeploy tanpa volume), sesi masih bisa dibangun ulang dari embed pesan.
const MAX_AGE_MS = 1000 * 60 * 60 * 24; // 24 jam
const cache = new Map();
let lastSweep = 0;

function dir() {
  return path.join(path.resolve(config.dataDir), 'newgame');
}

function filePath(pid) {
  return path.join(dir(), `${pid}.json`);
}

function ensureDir() {
  fs.mkdirSync(dir(), { recursive: true });
}

function save(state) {
  if (!state?.pid) return state;
  try {
    ensureDir();
    const file = filePath(state.pid);
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(state), 'utf8');
    fs.renameSync(tmp, file);
  } catch (err) {
    console.warn(`[newgame] gagal menyimpan sesi ${state.pid}: ${err.message}`);
  }
  return state;
}

function loadFromDisk(pid) {
  try {
    const state = JSON.parse(fs.readFileSync(filePath(pid), 'utf8'));
    if (state && state.pid === pid && Date.now() - (state.createdAt || 0) < MAX_AGE_MS) {
      return state;
    }
  } catch {
    /* belum ada / rusak */
  }
  return null;
}

/** Simpan ke cache + disk, dipakai juga saat sesi dibangun ulang dari embed. */
function adopt(state) {
  cache.set(state.pid, state);
  save(state);
  return state;
}

function createState(ownerId, defaults = {}) {
  const pid = crypto.randomBytes(4).toString('hex');
  return adopt({
    pid,
    ownerId,
    createdAt: Date.now(),
    gameName: '',
    description: null,
    color: defaults.color ?? null,
    thumbnailUrl: null,
    thumbnailFile: null, // { url, name } hasil upload modal
    features: [], // string[]
    script: defaults.script ?? '',
    keyChannelId: null,
    loaderChannelId: null,
    targetChannelId: null,
  });
}

function sweep() {
  const now = Date.now();
  for (const [pid, state] of cache) {
    if (now - (state.createdAt || 0) > MAX_AGE_MS) {
      cache.delete(pid);
      try {
        fs.unlinkSync(filePath(pid));
      } catch {
        /* ignore */
      }
    }
  }

  // Bersihkan file sesi lama di disk, sesekali saja (hemat I/O).
  if (now - lastSweep < 1000 * 60 * 10) return;
  lastSweep = now;
  try {
    for (const name of fs.readdirSync(dir())) {
      if (!name.endsWith('.json')) continue;
      const pid = name.slice(0, -'.json'.length);
      if (cache.has(pid)) continue;
      if (!loadFromDisk(pid)) {
        try {
          fs.unlinkSync(filePath(pid));
        } catch {
          /* ignore */
        }
      }
    }
  } catch {
    /* folder belum ada */
  }
}

function getState(pid) {
  if (!pid) return null;
  sweep();

  if (cache.has(pid)) return cache.get(pid);

  const fromDisk = loadFromDisk(pid);
  if (fromDisk) cache.set(pid, fromDisk);
  return fromDisk;
}

function deleteState(pid) {
  cache.delete(pid);
  try {
    fs.unlinkSync(filePath(pid));
  } catch {
    /* ignore */
  }
}

module.exports = { createState, getState, deleteState, adopt, save };
