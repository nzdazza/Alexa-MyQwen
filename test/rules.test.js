'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadRules, clearRulesCache, DEFAULT_RULES } = require('../lambda/rules');

test.beforeEach(() => clearRulesCache());

test('uses built-in rules when no remote URL is configured', async () => {
  assert.equal(await loadRules({ env: {} }), DEFAULT_RULES);
});

test('downloads and caches a remote Markdown rules file', async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return { ok: true, text: async () => '# Rules\nBe brief.' };
  };
  const env = { RULES_URL: 'https://example.test/rules.md', RULES_CACHE_HOURS: '24' };
  assert.match(await loadRules({ env, fetchImpl, now: 1000 }), /Be brief/);
  assert.match(await loadRules({ env, fetchImpl, now: 2000 }), /Be brief/);
  assert.equal(calls, 1);
});

test('force refresh bypasses the rules cache', async () => {
  let version = 0;
  const fetchImpl = async () => ({ ok: true, text: async () => `version ${++version}` });
  const env = { RULES_URL: 'https://example.test/rules.md' };
  assert.equal(await loadRules({ env, fetchImpl }), 'version 1');
  assert.equal(await loadRules({ env, fetchImpl, force: true }), 'version 2');
});

test('rejects a SharePoint preview page instead of caching HTML', async () => {
  await assert.rejects(() => loadRules({
    env: { RULES_URL: 'https://example.test/view' },
    fetchImpl: async () => ({ ok: true, text: async () => '<html>Sign in</html>' })
  }), /HTML/);
});

test('adds SharePoint download mode and carries its anonymous cookie across redirects', async () => {
  const requests = [];
  const fetchImpl = async (url, options) => {
    requests.push({ url: String(url), options });
    if (requests.length === 1) {
      return {
        status: 302,
        headers: {
          getSetCookie: () => ['FedAuth=anonymous-token; path=/; secure'],
          get: (name) => name === 'location' ? '/personal/user/Documents/Rules.md' : null
        }
      };
    }
    return {
      ok: true,
      status: 200,
      headers: { getSetCookie: () => [], get: () => null },
      text: async () => '# Rules\nUse live data.'
    };
  };
  const rules = await loadRules({
    env: { RULES_URL: 'https://tenant-my.sharepoint.com/:t:/g/personal/example?e=abc' },
    fetchImpl
  });
  assert.match(requests[0].url, /download=1/);
  assert.equal(requests[1].options.headers.cookie, 'FedAuth=anonymous-token');
  assert.match(rules, /Use live data/);
});
