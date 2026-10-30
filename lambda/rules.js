'use strict';

const DEFAULT_RULES = `
Answer using only the supplied live service data when it is present.
If the data is insufficient, say so rather than inventing details.
Write for speech: use plain sentences, no markdown, no URLs, and no citations.
Keep the answer concise and lead with the information the user asked for.
Tide predictions are informational and must not be described as suitable for navigation.
`.trim();

let cachedRules;
let cachedAt = 0;

function positiveInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

async function fetchRules(url, options) {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:') throw new Error('RULES_URL must use HTTPS');
  if (parsed.hostname.endsWith('.sharepoint.com') && parsed.pathname.startsWith('/:')) {
    parsed.searchParams.set('download', '1');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs);
  try {
    const response = await fetchFollowingSharePoint(parsed, {
      headers: { accept: 'text/markdown,text/plain;q=0.9,*/*;q=0.1' },
      signal: controller.signal
    }, options.fetchImpl);
    if (!response.ok) throw new Error(`Rules URL returned HTTP ${response.status}`);
    const text = (await response.text()).trim();
    if (!text) throw new Error('Rules file is empty');
    if (Buffer.byteLength(text, 'utf8') > options.maxBytes) throw new Error('Rules file is too large');
    if (/<!doctype html|<html[\s>]/i.test(text)) throw new Error('Rules URL returned HTML instead of Markdown');
    return text;
  } finally {
    clearTimeout(timeout);
  }
}

function responseCookies(response) {
  const values = typeof response.headers?.getSetCookie === 'function'
    ? response.headers.getSetCookie()
    : [response.headers?.get?.('set-cookie')].filter(Boolean);
  return values.map((value) => value.split(';', 1)[0]).filter(Boolean);
}

async function fetchFollowingSharePoint(initialUrl, requestOptions, fetchImpl) {
  if (!initialUrl.hostname.endsWith('.sharepoint.com')) {
    return fetchImpl(initialUrl, { ...requestOptions, redirect: 'follow' });
  }

  let current = initialUrl;
  const cookies = new Map();
  for (let redirects = 0; redirects <= 5; redirects += 1) {
    const headers = { ...requestOptions.headers };
    if (cookies.size) headers.cookie = [...cookies.entries()].map(([key, value]) => `${key}=${value}`).join('; ');
    const response = await fetchImpl(current, { ...requestOptions, headers, redirect: 'manual' });
    for (const cookie of responseCookies(response)) {
      const separator = cookie.indexOf('=');
      if (separator > 0) cookies.set(cookie.slice(0, separator), cookie.slice(separator + 1));
    }
    if (![301, 302, 303, 307, 308].includes(response.status)) return response;
    const location = response.headers?.get?.('location');
    if (!location) throw new Error('SharePoint redirect had no location');
    const next = new URL(location, current);
    if (next.hostname !== initialUrl.hostname) throw new Error('SharePoint redirected to an unexpected host');
    current = next;
  }
  throw new Error('Too many SharePoint redirects');
}

async function loadRules(options = {}) {
  const env = options.env || process.env;
  const now = options.now || Date.now();
  const cacheMs = positiveInt(env.RULES_CACHE_HOURS, 24) * 60 * 60 * 1000;
  if (!options.force && cachedRules && now - cachedAt < cacheMs) return cachedRules;

  if (!env.RULES_URL) return cachedRules || DEFAULT_RULES;
  try {
    const rules = await fetchRules(env.RULES_URL, {
      fetchImpl: options.fetchImpl || globalThis.fetch,
      timeoutMs: positiveInt(env.RULES_TIMEOUT_MS, 5000),
      maxBytes: positiveInt(env.RULES_MAX_BYTES, 100000)
    });
    cachedRules = rules;
    cachedAt = now;
    return rules;
  } catch (error) {
    if (options.force) throw error;
    if (cachedRules) return cachedRules;
    throw error;
  }
}

function clearRulesCache() {
  cachedRules = undefined;
  cachedAt = 0;
}

module.exports = { DEFAULT_RULES, loadRules, clearRulesCache };
