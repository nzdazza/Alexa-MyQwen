'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { searchBrave, getNiwaTides } = require('../src/services');

test('calls Brave Search with its subscription token', async () => {
  let request;
  const results = await searchBrave('latest space news', {
    config: { braveApiKey: 'brave-key', timeoutMs: 100, braveCountry: 'NZ', braveLanguage: 'en' },
    fetchImpl: async (url, options) => {
      request = { url: String(url), options };
      return { ok: true, json: async () => ({ web: { results: [{ title: 'Result', url: 'https://example.test', description: 'Summary' }] } }) };
    }
  });
  assert.match(request.url, /q=latest\+space\+news/);
  assert.equal(request.options.headers['x-subscription-token'], 'brave-key');
  assert.equal(results[0].title, 'Result');
});

test('calls NIWA tides with configured coordinates and API key', async () => {
  let request;
  const result = await getNiwaTides({
    config: {
      niwaApiKey: 'niwa-key', latitude: '-43.5', longitude: '172.6',
      locationName: 'Christchurch', timezone: 'Pacific/Auckland', timeoutMs: 100
    },
    fetchImpl: async (url, options) => {
      request = { url: String(url), options };
      return { ok: true, json: async () => ({ values: [] }) };
    }
  });
  assert.match(request.url, /lat=-43.5/);
  assert.match(request.url, /long=172.6/);
  assert.equal(request.options.headers['x-apikey'], 'niwa-key');
  assert.equal(result.location, 'Christchurch');
});
