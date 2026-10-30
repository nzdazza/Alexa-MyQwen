'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { askLiteLLM, compactHistory, configFromEnv } = require('../lambda/litellm');

const config = { baseUrl: 'https://example.test/v1', apiKey: 'secret', model: 'qwen', timeoutMs: 100, maxHistoryTurns: 2, maxResponseChars: 100, systemPrompt: 'Be brief.' };

test('calls OpenAI-compatible chat completions and returns answer', async () => {
  let request;
  const answer = await askLiteLLM('hello', [], { config, fetchImpl: async (url, options) => {
    request = { url, options };
    return { ok: true, json: async () => ({ choices: [{ message: { content: 'Hi there' } }] }) };
  }});
  assert.equal(answer, 'Hi there');
  assert.equal(request.url, 'https://example.test/v1/chat/completions');
  assert.equal(request.options.headers.authorization, 'Bearer secret');
  assert.equal(JSON.parse(request.options.body).messages.at(-1).content, 'hello');
});

test('limits history to configured turns', () => {
  const history = Array.from({ length: 8 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: String(i) }));
  assert.deepEqual(compactHistory(history, 2).map((x) => x.content), ['4', '5', '6', '7']);
});

test('reports upstream errors without consuming response body', async () => {
  await assert.rejects(() => askLiteLLM('hello', [], { config, fetchImpl: async () => ({ ok: false, status: 503 }) }), (error) => error.code === 'UPSTREAM_ERROR');
});

test('validates required environment variables', () => {
  assert.throws(() => configFromEnv({}), /LITELLM_BASE_URL/);
  assert.throws(() => configFromEnv({ LITELLM_BASE_URL: 'https://x' }), /LITELLM_API_KEY/);
});

