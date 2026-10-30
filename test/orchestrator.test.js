'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { answerQuestion, routeQuery, spokenAnswer } = require('../src/orchestrator');

test('routes tide language to NIWA and other questions to web search', () => {
  assert.equal(routeQuery('What are the tides today?'), 'tides');
  assert.equal(routeQuery('What happened in Wellington today?'), 'web');
});

test('grounds a tide answer with rules and NIWA data', async () => {
  let promptOptions;
  const answer = await answerQuestion('What are the tides?', [], {
    env: { ALEXA_MAX_WORDS: '20' },
    loadRules: async () => 'Keep tide answers short.',
    getNiwaTides: async () => ({ provider: 'NIWA', forecast: [{ time: 'tomorrow' }] }),
    askLiteLLM: async (_query, _history, options) => {
      promptOptions = options;
      return 'The next high tide is tomorrow.';
    }
  });
  assert.match(promptOptions.extraSystemPrompt, /Keep tide answers short/);
  assert.match(promptOptions.extraSystemPrompt, /NIWA/);
  assert.equal(answer, 'The next high tide is tomorrow.');
});

test('removes URLs and limits spoken answers', () => {
  assert.equal(spokenAnswer('See [this](https://example.test) now at https://example.test please', 4), 'See this now at.');
});
