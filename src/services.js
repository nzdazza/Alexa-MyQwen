'use strict';

function positiveInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

async function fetchJson(url, requestOptions, timeoutMs, fetchImpl) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, { ...requestOptions, signal: controller.signal });
    if (!response.ok) {
      const error = new Error(`Service returned HTTP ${response.status}`);
      error.code = 'SERVICE_ERROR';
      throw error;
    }
    return await response.json();
  } catch (error) {
    if (error.name === 'AbortError') {
      const timeoutError = new Error('Service request timed out');
      timeoutError.code = 'TIMEOUT';
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function serviceConfig(env = process.env) {
  return {
    braveApiKey: env.BRAVE_SEARCH_API_KEY || '',
    niwaApiKey: env.NIWA_API_KEY || '',
    latitude: env.DEFAULT_LATITUDE || '',
    longitude: env.DEFAULT_LONGITUDE || '',
    locationName: env.DEFAULT_LOCATION_NAME || 'the configured location',
    timezone: env.DEFAULT_TIMEZONE || 'Pacific/Auckland',
    timeoutMs: positiveInt(env.SERVICE_TIMEOUT_MS, 5000),
    braveCountry: env.BRAVE_SEARCH_COUNTRY || 'NZ',
    braveLanguage: env.BRAVE_SEARCH_LANGUAGE || 'en'
  };
}

async function searchBrave(query, options = {}) {
  const config = options.config || serviceConfig();
  if (!config.braveApiKey) throw new Error('BRAVE_SEARCH_API_KEY is required');
  const url = new URL('https://api.search.brave.com/res/v1/web/search');
  url.search = new URLSearchParams({
    q: query,
    count: '5',
    country: config.braveCountry,
    search_lang: config.braveLanguage
  });
  const data = await fetchJson(url, {
    headers: { accept: 'application/json', 'x-subscription-token': config.braveApiKey }
  }, config.timeoutMs, options.fetchImpl || globalThis.fetch);
  return (data?.web?.results || []).slice(0, 5).map(({ title, url: resultUrl, description, age }) => ({
    title,
    url: resultUrl,
    description,
    age
  }));
}

async function getNiwaTides(options = {}) {
  const config = options.config || serviceConfig();
  if (!config.niwaApiKey) throw new Error('NIWA_API_KEY is required');
  if (!config.latitude || !config.longitude) throw new Error('DEFAULT_LATITUDE and DEFAULT_LONGITUDE are required');
  const url = new URL('https://api.niwa.co.nz/tides/data');
  url.search = new URLSearchParams({
    lat: config.latitude,
    long: config.longitude,
    numberOfDays: '2',
    datum: 'LAT'
  });
  const data = await fetchJson(url, {
    headers: { accept: 'application/json', 'x-apikey': config.niwaApiKey }
  }, config.timeoutMs, options.fetchImpl || globalThis.fetch);
  return {
    provider: 'NIWA Tide Forecasting API',
    location: config.locationName,
    latitude: config.latitude,
    longitude: config.longitude,
    timezone: config.timezone,
    datum: 'LAT',
    forecast: data
  };
}

module.exports = { serviceConfig, searchBrave, getNiwaTides };
