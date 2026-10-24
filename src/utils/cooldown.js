'use strict';

const lastSeen = new Map();
const MAX_ENTRIES = 10000;

/**
 * Catat pemakaian dan cek apakah sebuah key masih dalam masa cooldown.
 * @param {string} key
 * @param {number} ms
 * @returns {boolean} true jika masih cooldown (harus dilewati)
 */
function isOnCooldown(key, ms) {
  const now = Date.now();
  const prev = lastSeen.get(key);

  if (prev !== undefined && now - prev < ms) {
    return true;
  }

  lastSeen.set(key, now);

  if (lastSeen.size > MAX_ENTRIES) {
    for (const [k, ts] of lastSeen) {
      if (now - ts > ms * 4) lastSeen.delete(k);
    }
  }

  return false;
}

module.exports = { isOnCooldown };