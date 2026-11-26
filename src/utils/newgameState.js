'use strict';

const crypto = require('node:crypto');

const states = new Map();
const MAX_AGE_MS = 1000 * 60 * 30;

/**
 * Sesi sementara untuk command /newgame (di memori saja, tidak disimpan).
 * @param {string} ownerId
 * @param {{ color?: string|null, script?: string|null }} [defaults]
 */
function createState(ownerId, defaults = {}) {
  const pid = crypto.randomBytes(4).toString('hex');
  const state = {
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
  };
  states.set(pid, state);
  return state;
}

function prune() {
  const now = Date.now();
  for (const [pid, state] of states) {
    if (now - state.createdAt > MAX_AGE_MS) {
      states.delete(pid);
    }
  }
}

function getState(pid) {
  prune();
  return states.get(pid) ?? null;
}

function deleteState(pid) {
  states.delete(pid);
}

module.exports = { createState, getState, deleteState };
