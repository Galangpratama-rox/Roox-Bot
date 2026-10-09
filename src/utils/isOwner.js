'use strict';

const config = require('../config');

/**
 * Cek apakah seorang user termasuk owner (berdasarkan User ID).
 * @param {string} userId
 * @returns {boolean}
 */
function isOwner(userId) {
  return config.ownerIds.includes(userId);
}

module.exports = { isOwner };