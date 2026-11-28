'use strict';

// ---------------------------------------------------------------------------
// Pelindung interaksi: cegah eksekusi dobel & rapikan error interaksi mati.
// ---------------------------------------------------------------------------

// Interaksi yang sudah diproses proses ini (id -> timestamp). Mencegah satu
// interaksi dieksekusi dua kali (mis. event terkirim ulang / listener dobel).
const seen = new Map();
const SEEN_TTL_MS = 30 * 1000;
const SEEN_MAX = 5000;

// Interaksi "mati": token sudah dipakai (10062) atau sudah dibalas (40060).
const DEAD_CODES = new Set([10062, 40060]);
const DEAD_RE = /unknown interaction|already (?:been )?(?:acknowledged|replied)/i;

let lastWarn = 0;
const WARN_EVERY_MS = 10 * 60 * 1000;

function pruneSeen() {
  if (seen.size < SEEN_MAX) return;
  const now = Date.now();
  for (const [id, ts] of seen) {
    if (now - ts > SEEN_TTL_MS) seen.delete(id);
  }
}

/**
 * Catat interaksi dan cek apakah id ini sudah pernah diproses.
 * @param {import('discord.js').Interaction} interaction
 * @returns {boolean} true = interaksi ini sudah pernah diproses, abaikan.
 */
function isDuplicate(interaction) {
  const id = interaction?.id;
  if (!id) return false;

  pruneSeen();
  if (seen.has(id)) return true;
  seen.set(id, Date.now());
  return false;
}

/** True kalau errornya karena interaksi sudah tidak bisa dibalas lagi. */
function isDeadInteraction(err) {
  if (!err) return false;
  if (DEAD_CODES.has(err.code)) return true;
  return DEAD_RE.test(String(err.message || ''));
}

/** Peringatan ringkas (maks sekali per 10 menit) tentang interaksi mati. */
function warnDeadInteraction() {
  const now = Date.now();
  if (now - lastWarn < WARN_EVERY_MS) return;
  lastWarn = now;
  console.warn(
    '[interaksi] Respons dilewati: interaksi sudah tidak valid (Unknown interaction). ' +
      'Penyebab umum: respon > 3 detik, overlap deploy (container lama masih hidup), ' +
      'atau token dipakai 2 proses sekaligus. ' +
      'Cek log "[bot] instance" — harus hanya satu pid per boot.'
  );
}

module.exports = { isDuplicate, isDeadInteraction, warnDeadInteraction };
