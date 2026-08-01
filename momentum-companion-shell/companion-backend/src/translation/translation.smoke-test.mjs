// Standalone, no-network smoke test for the translation module.
// Run: node src/translation/translation.smoke-test.mjs
import assert from 'node:assert/strict';
import { splitIntoWordChunks, VulavulaTranslator } from './vulavula.mjs';
import { PassthroughTranslator } from './passthrough.mjs';
import { MockTranslator } from './mock.mjs';
import { GatewayLanguageDetector, NullLanguageDetector, parseDetectionReply } from './detector.mjs';
import { GatewayTranslator } from './gateway-translator.mjs';
import { runMultilingualTurn } from './index.mjs';

// 1. Chunking splits long text and respects the word cap.
const longText = Array.from({ length: 10 }, () => 'word word word word word word.').join(' ');
assert.ok(splitIntoWordChunks(longText, 20).length > 1, 'long text should split into multiple chunks');

// 2. Vulavula adapter sends the confirmed request shape and parses the response.
let capturedRequest = null;
const fakeFetch = async (url, options) => {
  capturedRequest = { url, options };
  return {
    ok: true,
    async json() {
      return { id: 'test', translation: [{ translated_text: 'Nasi usizo' }] };
    },
  };
};
const vulavula = new VulavulaTranslator({ apiToken: 'test-token', fetchImpl: fakeFetch });
assert.equal(await vulavula.fromEnglish('Here is help', 'zul_Latn'), 'Nasi usizo');
assert.equal(capturedRequest.options.headers['X-CLIENT-TOKEN'], 'test-token');
assert.deepEqual(JSON.parse(capturedRequest.options.body), {
  input_text: 'Here is help',
  source_lang: 'eng_Latn',
  target_lang: 'zul_Latn',
});

// 3. Cache: a repeat call must not hit fetch again.
capturedRequest = null;
await vulavula.fromEnglish('Here is help', 'zul_Latn');
assert.equal(capturedRequest, null, 'cached phrase should not call fetch');

// 4. parseDetectionReply tolerates code fences and validates the payload.
const parsed = parseDetectionReply('```json\n{"code":"zul_Latn","english_text":"I need help","confidence":0.9}\n```');
assert.deepEqual(parsed, { code: 'zul_Latn', englishText: 'I need help', confidence: 0.9 });
assert.equal(parseDetectionReply('not json at all'), null);

// 5. Detector: fake gateway returns JSON; detector normalises it.
const detector = new GatewayLanguageDetector({
  callModel: async () => '{"code":"zul_Latn","english_text":"I need help","confidence":0.95}',
});
const detection = await detector.detectAndTranslate('Ngicela usizo', { hintLang: 'eng_Latn' });
assert.equal(detection.code, 'zul_Latn');
assert.equal(detection.englishText, 'I need help');

// 6. Detector degrades to the hint language when the model call throws.
const failingDetector = new GatewayLanguageDetector({
  callModel: async () => {
    throw new Error('gateway down');
  },
});
const degradedDetection = await failingDetector.detectAndTranslate('hello', { hintLang: 'eng_Latn' });
assert.equal(degradedDetection.code, 'eng_Latn');
assert.equal(degradedDetection.confidence, 0);

// 7. Full turn: isiZulu in, English pipeline, isiZulu out.
const mockTranslator = new MockTranslator({
  fixtures: { 'eng_Latn|zul_Latn|Here is your help': 'Nasi usizo lwakho' },
});
const turnDetector = new GatewayLanguageDetector({
  callModel: async () => '{"code":"zul_Latn","english_text":"I need help","confidence":0.95}',
});
const englishPipeline = async (englishText) => {
  assert.equal(englishText, 'I need help', 'pipeline should receive English');
  return 'Here is your help';
};
const turn = await runMultilingualTurn({
  detector: turnDetector,
  translator: mockTranslator,
  storedLang: null,
  userText: 'Ngicela usizo',
  runEnglishPipeline: englishPipeline,
});
assert.equal(turn.reply, 'Nasi usizo lwakho');
assert.equal(turn.langUsed, 'zul_Latn');
assert.equal(turn.degraded, false);

// 8. English member: NullLanguageDetector + passthrough stays English, no Vulavula.
const englishTurn = await runMultilingualTurn({
  detector: new NullLanguageDetector(),
  translator: new PassthroughTranslator(),
  storedLang: null,
  userText: 'I need help',
  runEnglishPipeline: async () => 'Here is your help',
});
assert.equal(englishTurn.reply, 'Here is your help');
assert.equal(englishTurn.langUsed, 'eng_Latn');

// 9. GatewayTranslator sends a directional prompt and returns the trimmed reply.
let gatewayMessages = null;
const gatewayTranslator = new GatewayTranslator({
  callModel: async (messages) => {
    gatewayMessages = messages;
    return '  Nasi usizo lwakho  ';
  },
});
assert.equal(await gatewayTranslator.fromEnglish('Here is your help', 'zul_Latn'), 'Nasi usizo lwakho');
assert.match(gatewayMessages[0].content, /into isiZulu/);
assert.equal(gatewayMessages[1].content, 'Here is your help');

console.log('translation smoke test: all assertions passed');
