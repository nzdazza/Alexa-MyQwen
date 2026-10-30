# Alexa Qwen private skill

A private Alexa custom skill invoked with **“Alexa, open Qwen”**. Spoken questions are forwarded to an OpenAI-compatible LiteLLM `/v1/chat/completions` endpoint, suitable for a self-hosted Qwen model.

## What is included

- Node.js 20 Lambda handler using the Alexa Skills Kit SDK
- Alexa interaction model with the invocation name `qwen`
- Short in-session conversation history (no database persistence)
- Configurable request timeout, bounded context, and user-friendly failures
- Live web grounding with Brave Search and tide forecasts from NIWA
- One remotely hosted Markdown rules file with a 24-hour in-memory cache and voice refresh
- Tests using Node's built-in test runner
- AWS SAM template and Alexa skill-package files

## Prerequisites

- An Alexa Developer account and an Amazon account with AWS Lambda access
- AWS CLI and AWS SAM CLI, or equivalent console access
- A LiteLLM endpoint reachable from the public internet over HTTPS (or a Lambda VPC configuration that can reach it)
- Node.js 20+

## Configure LiteLLM

The endpoint must accept OpenAI-compatible requests at:

```text
https://your-host.example/v1/chat/completions
```

Set `LITELLM_BASE_URL` to the URL ending in `/v1`; the code adds `/chat/completions`.

## Import as an Alexa-hosted skill

The repository uses Amazon's Alexa-hosted Node.js skill package layout: application code is in `lambda/` and the voice model and manifest are in `skill-package/`.

1. In the Alexa Developer Console, create a **Custom** skill.
2. Select **Alexa-Hosted (Node.js)** and **English (AU)** as the default language for New Zealand devices.
3. Select **Import skill** and enter `https://github.com/nzdazza/Alexa-MyQwen.git`.
4. After the import completes, open the **Code** tab and edit `lambda/config.js`.
5. Fill in the empty LiteLLM, Brave, NIWA, and rules URL values. The imported Alexa-hosted repository is separate from the public template repository; do not copy the edited credentials back to public GitHub.
6. Click **Save**, then **Deploy**. On the Build tab, build the interaction model and enable development testing.

The checked-in `lambda/config.js` contains placeholders only. `.env` is used only for local testing and is not imported.

## Alternative: deploy your own Lambda

```bash
npm ci
npm test
sam build
sam deploy --guided
```

During `sam deploy --guided`, supply the base URL, model name, and API key. The template marks the key parameter `NoEcho`, but CloudFormation parameter values are not an ideal long-term secret store. For production, place the key in AWS Secrets Manager and inject it through your deployment system or adapt the function to retrieve it at runtime. Never commit `.env`, deployment parameter files containing secrets, or a real key.

Copy the `FunctionArn` output. In AWS Lambda, add an **Alexa Skills Kit** trigger after creating the Alexa skill, and restrict it to that skill's ID. This prevents other Alexa skills from invoking the function. This alternative requires your own AWS account and AWS CLI credentials.

## Create/import the Alexa skill

1. In the Alexa Developer Console, create a **Custom** skill named `Qwen Private`, using your preferred hosting option.
2. For a self-hosted ASK CLI workflow, set the deployed Lambda endpoint in the skill manifest. Alternatively, paste `skill-package/interactionModels/custom/en-US.json` into the console's JSON editor.
3. Set the endpoint to the Lambda ARN and select the correct region.
4. Build the model, enable testing in **Development**, and keep distribution private/unpublished.
5. Add the skill ID to the Lambda Alexa Skills Kit trigger.

Alexa invocation names are subject to Amazon's model validation. “Qwen” may be pronounced or recognized differently across locales/devices; test it on the target device. The included model is `en-US`. To use another locale, copy the model to the matching locale filename and adjust sample phrases as needed.

## Usage

- “Alexa, open Qwen”
- “Alexa, ask Qwen to explain why the sky is blue”
- During the same open session: “What about at sunset?”

Alexa sessions are short-lived. Context is retained only in the current session and is capped by `MAX_HISTORY_TURNS`; it is not stored after the session ends.

## Environment variables

| Variable | Required | Default | Purpose |
|---|---:|---|---|
| `LITELLM_BASE_URL` | yes | — | LiteLLM base URL ending in `/v1` |
| `LITELLM_API_KEY` | yes | — | Bearer token; keep secret |
| `LITELLM_MODEL` | no | `qwen2.5` | LiteLLM model/alias |
| `REQUEST_TIMEOUT_MS` | no | `7000` | Abort slow upstream requests |
| `MAX_HISTORY_TURNS` | no | `4` | Prior user/assistant pairs retained |
| `MAX_RESPONSE_CHARS` | no | `7000` | Defensive spoken-response cap |
| `SYSTEM_PROMPT` | no | voice-optimized prompt | Override assistant behavior |
| `BRAVE_SEARCH_API_KEY` | yes | - | Brave Search subscription token |
| `NIWA_API_KEY` | yes | - | NIWA Tide API key |
| `DEFAULT_LOCATION_NAME` | yes | - | Spoken name for the configured tide location |
| `DEFAULT_LATITUDE` / `DEFAULT_LONGITUDE` | yes | - | Coordinates sent to NIWA |
| `DEFAULT_TIMEZONE` | no | `Pacific/Auckland` | Timezone supplied with tide context |
| `RULES_URL` | no | built-in rules | HTTPS URL returning the single Markdown rules file |
| `RULES_CACHE_HOURS` | no | `24` | In-memory rules cache lifetime |
| `ALEXA_MAX_WORDS` | no | `120` | Maximum final spoken-answer length |

Questions mentioning tides or tidal conditions use the NIWA Tide Forecasting API. Other knowledge questions use Brave Search, and Qwen receives the returned results as grounding data. Say "refresh your rules" while the skill is open to force the current Lambda environment to download `RULES_URL` again. The URL must return Markdown/plain text rather than a SharePoint preview or sign-in page.

Lambda has a 10-second timeout and the upstream request defaults to 7 seconds, leaving time for Alexa to receive a graceful response. Alexa itself also imposes response timing limits, so keep the model warm and fast. Avoid logging prompts, answers, authorization headers, or keys; this project logs only outcome, error code, and latency.

## Local verification

```bash
npm ci
npm test
npm run check
```

Do not put a real key in `.env.example`. `.env` and common secret-bearing variants are ignored by Git.

## Repository import

This folder can be initialized and imported into any private Git host:

```bash
git init
git add .
git commit -m "Initial private Alexa Qwen skill"
```

No remote is configured or pushed by this project.

