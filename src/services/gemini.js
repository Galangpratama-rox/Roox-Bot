'use strict';

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const TIMEOUT_MS = 20000;
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);
const MAX_ATTEMPTS = 3;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function requestOnce({ apiKey, model, systemPrompt, userText }) {
  const url = `${API_BASE}/${encodeURIComponent(model)}:generateContent`;

  const body = {
    systemInstruction: { parts: [{ text: systemPrompt }] },
    contents: [{ role: 'user', parts: [{ text: userText }] }],
    generationConfig: {
      temperature: 0.15,
      maxOutputTokens: 250,
      topP: 0.9,
    },
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    const fail = new Error(
      err.name === 'AbortError' ? `Gemini timeout (${TIMEOUT_MS}ms)` : `Gemini koneksi gagal: ${err.message}`
    );
    fail.retryable = true;
    throw fail;
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    const fail = new Error(`Gemini ${res.status}${detail ? `: ${detail.slice(0, 200)}` : ''}`);
    fail.status = res.status;
    fail.retryable = RETRYABLE_STATUS.has(res.status);
    throw fail;
  }

  let data;
  try {
    data = await res.json();
  } catch {
    throw new Error('Respons Gemini bukan JSON valid.');
  }

  const parts = data?.candidates?.[0]?.content?.parts;
  return Array.isArray(parts) ? parts.map((part) => part.text || '').join('').trim() : '';
}

/**
 * Panggil Gemini generateContent via REST (dengan retry ringan).
 * @param {object} params
 * @param {string} params.apiKey
 * @param {string} params.model
 * @param {string} params.systemPrompt
 * @param {string} params.userText
 * @returns {Promise<string>} teks jawaban
 */
async function generate(params) {
  let lastErr;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await requestOnce(params);
    } catch (err) {
      lastErr = err;
      if (attempt < MAX_ATTEMPTS && err.retryable) {
        await sleep(1200);
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

module.exports = { generate };