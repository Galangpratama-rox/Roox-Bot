'use strict';

const crypto = require('node:crypto');

const states = new Map();
const MAX_AGE_MS = 1000 * 60 * 30;

function createState(ownerId) {
  const pid = crypto.randomBytes(4).toString('hex');
  const state = {
    pid,
    ownerId,
    createdAt: Date.now(),
    channelId: null,
    title: null,
    description: null,
    url: null,
    color: null,
    imageUrl: null,
    thumbnail: null,
    authorName: null,
    authorIcon: null,
    footer: null,
    footerIcon: null,
    fields: [],
    links: [],
    timestamp: false,
    uploaded: [],
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