'use strict';

const localConfig = require('./config');
for (const [name, value] of Object.entries(localConfig)) {
  if (!process.env[name] && value !== undefined && value !== null && value !== '') process.env[name] = String(value);
}

const Alexa = require('ask-sdk-core');
const { compactHistory } = require('./litellm');
const { answerQuestion } = require('./orchestrator');
const { loadRules } = require('./rules');

const LaunchRequestHandler = {
  canHandle(input) {
    return Alexa.getRequestType(input.requestEnvelope) === 'LaunchRequest';
  },
  handle(input) {
    return input.responseBuilder
      .speak('Qwen is ready. What would you like to ask?')
      .reprompt('What would you like to ask Qwen?')
      .getResponse();
  }
};

const AskQwenIntentHandler = {
  canHandle(input) {
    return Alexa.getRequestType(input.requestEnvelope) === 'IntentRequest' &&
      Alexa.getIntentName(input.requestEnvelope) === 'AskQwenIntent';
  },
  async handle(input) {
    const query = Alexa.getSlotValue(input.requestEnvelope, 'query')?.trim();
    if (!query) {
      return input.responseBuilder.speak('What would you like to ask?').reprompt('Please ask a question.').getResponse();
    }

    const attributes = input.attributesManager.getSessionAttributes();
    const history = compactHistory(attributes.history, Number.parseInt(process.env.MAX_HISTORY_TURNS || '4', 10));
    const startedAt = Date.now();
    try {
      const answer = await answerQuestion(query, history);
      attributes.history = compactHistory([...history, { role: 'user', content: query }, { role: 'assistant', content: answer }], Number.parseInt(process.env.MAX_HISTORY_TURNS || '4', 10));
      input.attributesManager.setSessionAttributes(attributes);
      console.info('LiteLLM request succeeded', { latencyMs: Date.now() - startedAt });
      return input.responseBuilder.speak(answer).reprompt('You can ask another question.').getResponse();
    } catch (error) {
      console.error('LiteLLM request failed', { code: error.code || 'UNKNOWN', latencyMs: Date.now() - startedAt });
      const message = error.code === 'TIMEOUT'
        ? 'Qwen is taking too long to respond. Please try again.'
        : 'I could not reach Qwen just now. Please try again in a moment.';
      return input.responseBuilder.speak(message).reprompt('You can try your question again.').getResponse();
    }
  }
};

const RefreshRulesIntentHandler = {
  canHandle(input) {
    return Alexa.getRequestType(input.requestEnvelope) === 'IntentRequest' &&
      Alexa.getIntentName(input.requestEnvelope) === 'RefreshRulesIntent';
  },
  async handle(input) {
    try {
      await loadRules({ force: true });
      return input.responseBuilder.speak('The rules have been refreshed.').reprompt('What would you like to ask?').getResponse();
    } catch (error) {
      console.error('Rules refresh failed', { name: error.name });
      return input.responseBuilder.speak('I could not refresh the rules, so I have kept the previous version.').reprompt('What would you like to ask?').getResponse();
    }
  }
};

const HelpIntentHandler = {
  canHandle(input) {
    return Alexa.getRequestType(input.requestEnvelope) === 'IntentRequest' && Alexa.getIntentName(input.requestEnvelope) === 'AMAZON.HelpIntent';
  },
  handle(input) {
    return input.responseBuilder.speak('Ask me anything, for example, explain quantum computing simply.').reprompt('What would you like to ask?').getResponse();
  }
};

const StopIntentHandler = {
  canHandle(input) {
    const name = Alexa.getIntentName(input.requestEnvelope);
    return Alexa.getRequestType(input.requestEnvelope) === 'IntentRequest' && ['AMAZON.CancelIntent', 'AMAZON.StopIntent'].includes(name);
  },
  handle(input) {
    return input.responseBuilder.speak('Goodbye.').withShouldEndSession(true).getResponse();
  }
};

const FallbackIntentHandler = {
  canHandle(input) {
    return Alexa.getRequestType(input.requestEnvelope) === 'IntentRequest' && Alexa.getIntentName(input.requestEnvelope) === 'AMAZON.FallbackIntent';
  },
  handle(input) {
    return input.responseBuilder.speak('I did not catch that. Try saying, ask Qwen followed by your question.').reprompt('What would you like to ask?').getResponse();
  }
};

const SessionEndedHandler = {
  canHandle(input) { return Alexa.getRequestType(input.requestEnvelope) === 'SessionEndedRequest'; },
  handle(input) { return input.responseBuilder.getResponse(); }
};

const ErrorHandler = {
  canHandle() { return true; },
  handle(input, error) {
    console.error('Unhandled skill error', { name: error.name });
    return input.responseBuilder.speak('Sorry, something went wrong. Please try again.').reprompt('Please try again.').getResponse();
  }
};

exports.handler = Alexa.SkillBuilders.custom()
  .addRequestHandlers(LaunchRequestHandler, AskQwenIntentHandler, RefreshRulesIntentHandler, HelpIntentHandler, StopIntentHandler, FallbackIntentHandler, SessionEndedHandler)
  .addErrorHandlers(ErrorHandler)
  .lambda();

