'use strict';

const DEFAULT_SYSTEM_PROMPT =
  'You are Qwen speaking through an Alexa device. Answer clearly and concisely. ' +
  'Use plain spoken language, avoid markdown, URLs, and long lists.';

function positiveInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function configFromEnv(env = process.env) {
  const baseUrl = (env.LITELLM_BASE_URL || '').replace(/\/$/, '');
  if (!baseUrl) throw new Error('LITELLM_BASE_URL is required');
  if (!env.LITELLM_API_KEY) throw new Error('LITELLM_API_KEY is required');
  return {
    baseUrl,
    apiKey: env.LITELLM_API_KEY,
    model: env.LITELLM_MODEL || 'qwen2.5',
    timeoutMs: positiveInt(env.REQUEST_TIMEOUT_MS, 7000),
    maxHistoryTurns: positiveInt(env.MAX_HISTORY_TURNS, 4),
    maxResponseChars: positiveInt(env.MAX_RESPONSE_CHARS, 7000),
    systemPrompt: env.SYSTEM_PROMPT || DEFAULT_SYSTEM_PROMPT
  };
}

function compactHistory(history, maxTurns) {
  const valid = Array.isArray(history)
    ? history.filter((item) => item && ['user', 'assistant'].includes(item.role) && typeof item.content === 'string')
    : [];
  return valid.slice(-(maxTurns * 2));
}

async function askLiteLLM(query, history = [], options = {}) {
  const config = options.config || configFromEnv();
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
  const prior = compactHistory(history, config.maxHistoryTurns);

  try {
    const response = await fetchImpl(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${config.apiKey}`
      },
      body: JSON.stringify({
        model: config.model,
        messages: [{
          role: 'system',
          content: [config.systemPrompt, options.extraSystemPrompt].filter(Boolean).join('\n\n')
        }, ...prior, { role: 'user', content: query }],
        temperature: 0.4,
        max_tokens: 500
      }),
      signal: controller.signal
    });
    if (!response.ok) {
      const error = new Error(`LiteLLM returned HTTP ${response.status}`);
      error.code = 'UPSTREAM_ERROR';
      throw error;
    }
    const data = await response.json();
    const answer = data?.choices?.[0]?.message?.content?.trim();
    if (!answer) {
      const error = new Error('LiteLLM returned an empty response');
      error.code = 'EMPTY_RESPONSE';
      throw error;
    }
    return answer.slice(0, config.maxResponseChars);
  } catch (error) {
    if (error.name === 'AbortError') {
      const timeoutError = new Error('LiteLLM request timed out');
      timeoutError.code = 'TIMEOUT';
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = { askLiteLLM, compactHistory, configFromEnv };

