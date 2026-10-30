'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const config = require('../config');

// Batas aman di bawah limit upload Discord biasa (10 MB).
const MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.apng']);

function assetDir() {
  return path.join(path.resolve(config.dataDir), 'assets');
}

function ensureDir() {
  fs.mkdirSync(assetDir(), { recursive: true });
}

function safeName(fileName) {
  const base = path.basename(String(fileName || ''));
  return base.replace(/[^A-Za-z0-9._-]+/g, '_');
}

function extOf(name) {
  return path.extname(String(name || '')).toLowerCase();
}

function isAllowedFile(name) {
  return ALLOWED_EXT.has(extOf(name));
}

function assetPath(fileName) {
  return path.join(assetDir(), safeName(fileName));
}

function exists(fileName) {
  if (!fileName) return false;
  try {
    return fs.existsSync(assetPath(fileName));
  } catch {
    return false;
  }
}

/**
 * Simpan buffer dengan nama file eksplisit (dipakai saat menyalin dari pesan).
 * @param {string} fileName
 * @param {Buffer} buffer
 */
function write(fileName, buffer) {
  if (!buffer || !buffer.length) throw new Error('File kosong.');
  if (buffer.length > MAX_BYTES) {
    throw new Error(`Ukuran file maksimal ${MAX_BYTES / 1024 / 1024} MB.`);
  }
  ensureDir();
  const name = safeName(fileName);
  fs.writeFileSync(assetPath(name), buffer);
  return name;
}

/**
 * Simpan file hasil upload. Nama diberi tag jenis + hash isi, contoh:
 * `banner-1a2b3c4d5e.gif`. Tag membuat lampiran pesan bisa dikenali lagi
 * kalau state.json hilang (redeploy), hash mencegah cache gambar versi lama.
 * @param {Buffer} buffer
 * @param {string} originalName
 * @param {string} [tag] contoh: thumbnail, banner, authoricon, footericon
 */
function saveUpload(buffer, originalName, tag = 'image') {
  if (!isAllowedFile(originalName)) {
    throw new Error(
      `Format "${extOf(originalName) || '?'}" tidak didukung. Pakai PNG, JPG, WEBP, atau GIF.`
    );
  }
  const safeTag = String(tag).toLowerCase().replace(/[^a-z0-9]/g, '') || 'image';
  const hash = crypto.createHash('sha1').update(buffer).digest('hex').slice(0, 10);
  return write(`${safeTag}-${hash}${extOf(originalName)}`, buffer);
}

function read(fileName) {
  if (!fileName) return null;
  try {
    return fs.readFileSync(assetPath(fileName));
  } catch {
    return null;
  }
}

/**
 * Unduh isi attachment Discord (dipakai saat memindahkan aset lama ke disk).
 * @param {string} url
 */
async function download(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Gagal mengunduh file (HTTP ${response.status}).`);
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Hapus aset yang sudah tidak dipakai media, supaya folder tidak menumpuk.
 * @param {Iterable<string>} referencedNames
 */
function prune(referencedNames) {
  const keep = new Set([...referencedNames].filter(Boolean).map(safeName));
  let removed = 0;
  try {
    for (const entry of fs.readdirSync(assetDir())) {
      if (keep.has(entry)) continue;
      try {
        fs.unlinkSync(path.join(assetDir(), entry));
        removed += 1;
      } catch {
        /* ignore */
      }
    }
  } catch {
    return 0;
  }
  return removed;
}

module.exports = {
  MAX_BYTES,
  assetDir,
  assetPath,
  isAllowedFile,
  exists,
  write,
  saveUpload,
  read,
  download,
  prune,
};
