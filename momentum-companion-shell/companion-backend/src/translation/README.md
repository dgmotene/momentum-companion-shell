# Translation module

Lets members chat with the companion in supported African languages. It is an
optional, in-process layer inside `companion-backend`: the app runs fully with
or without it.

## How it works

Reason in English, translate at the edge. Each turn:

1. **Detect + inbound** - the gateway model (Haiku) identifies the member's
   language and translates their message to English, in one call.
2. **English pipeline** - your existing intent / RAG / compose flow runs
   unchanged, in English.
3. **Outbound** - Vulavula translates the English reply back into the member's
   language (the text they read).

Detection is the gateway's job because Vulavula has no text language-detection
endpoint (its "Text LID" is listed but not yet available; only speech LID
exists). Vulavula handles the outbound leg, where translation quality is visible
to the member.

## The optional-dependency contract

The Lelapa component is never a hard dependency:

- **Default off.** `TRANSLATION_PROVIDER` unset or `none` is a complete no-op:
  `NullLanguageDetector` + `PassthroughTranslator`, no token required, no network
  calls, identical response contract (plain English, `langUsed: "eng_Latn"`).
- **Fails safe.** Missing token, Vulavula error, unparseable detection, or
  low-confidence detection all degrade to English rather than breaking the turn.
- **No import-time cost.** The module is pure JS on Node built-ins; importing it
  changes nothing until a provider is selected.

Acceptance check: the app behaves normally with `TRANSLATION_PROVIDER` unset,
and again with it set, differing only in reply language.

## Configuration (backend-only)

```
TRANSLATION_PROVIDER=none        # none | mock | vulavula | gateway
VULAVULA_API_TOKEN=              # read only when provider=vulavula
```

| Provider   | Outbound translator | Use |
|------------|---------------------|-----|
| `none`     | passthrough         | disabled (default) |
| `mock`     | offline fixtures    | demos / video, zero quota |
| `vulavula` | Vulavula API        | real member-facing translation |
| `gateway`  | Haiku model         | A/B against Vulavula, or fallback |

## Integrating into /api/chat

The one dependency is a `callModel` function from the gateway client:

```js
// callModel(messages) -> Promise<string>
//   messages: [{ role, content }, ...]  (OpenAI-compatible)
//   returns:  the assistant reply text (choices[0].message.content)

import { createTranslator, createDetector, runMultilingualTurn } from './translation/index.mjs';

const translator = createTranslator(process.env, { callModel }); // built once at startup
const detector = createDetector(process.env, { callModel });

// inside POST /api/chat:
const { reply, langUsed, degraded } = await runMultilingualTurn({
  detector,
  translator,
  storedLang: conversation.lang ?? null,       // remembered language, or null on turn 1
  userText: requestBody.message,
  runEnglishPipeline: async (englishText) => composeGroundedReplyInEnglish(englishText),
});
conversation.lang = langUsed;                   // persist for the next turn
res.json({ reply, langUsed, degraded });
```

`storedLang` persistence is the caller's responsibility; passing `null` every
turn works too (detection just runs each turn).

## Testing

```
node src/translation/translation.smoke-test.mjs
```

Fully offline: fake `fetch` and fake `callModel`, no network, no new
dependencies. Covers chunking, the Vulavula request shape, caching, detection
parsing and degradation, the gateway translator, and the full round-trip. The
`Error: gateway down` line it prints is a deliberate degradation test, not a
failure; the final `all assertions passed` line is the result.

## Vulavula facts (confirmed)

- Endpoint: `POST https://api.lelapa.ai/v1/translate/process`
- Auth header: `X-CLIENT-TOKEN` (key expires every 90 days)
- Body: `{ input_text, source_lang, target_lang }`; response:
  `{ translation: [{ translated_text }] }`
- Free tier: 100 calls/month; guidance is under ~100 words per request (the
  adapter caches and chunks accordingly)
- 13 supported language codes: see `languages.mjs`

Source: https://docs.lelapa.ai
