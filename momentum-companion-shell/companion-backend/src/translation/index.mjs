import { VulavulaTranslator } from './vulavula.mjs';
import { GatewayTranslator } from './gateway-translator.mjs';
import { PassthroughTranslator } from './passthrough.mjs';
import { MockTranslator } from './mock.mjs';
import { GatewayLanguageDetector, NullLanguageDetector } from './detector.mjs';
import { ENGLISH_CODE, isEnglish } from './languages.mjs';

export { SUPPORTED_LANGUAGES } from './languages.mjs';

// Below this detection confidence we do not trust the detected language and fall
// back to the conversation's stored language (or English). Keeps short, ambiguous
// follow-ups ("yes", "ok") from flipping the conversation into the wrong language.
const MIN_DETECTION_CONFIDENCE = 0.6;

/**
 * Translator port (outbound reply -> the member's language):
 *   toEnglish(text, sourceLangCode)   -> Promise<string>
 *   fromEnglish(text, targetLangCode) -> Promise<string>
 *
 * Selected by TRANSLATION_PROVIDER: none (passthrough) | mock | vulavula | gateway.
 * The gateway provider translates with the Haiku model and so needs callModel.
 */
export function createTranslator(env = process.env, { callModel } = {}) {
  const provider = (env.TRANSLATION_PROVIDER ?? 'none').toLowerCase();

  if (provider === 'vulavula') {
    if (!env.VULAVULA_API_TOKEN) {
      console.warn('[translation] provider=vulavula but VULAVULA_API_TOKEN unset; using passthrough');
      return new PassthroughTranslator();
    }
    return new VulavulaTranslator({ apiToken: env.VULAVULA_API_TOKEN });
  }

  if (provider === 'gateway') {
    if (typeof callModel !== 'function') {
      console.warn('[translation] provider=gateway but no callModel supplied; using passthrough');
      return new PassthroughTranslator();
    }
    return new GatewayTranslator({ callModel });
  }

  if (provider === 'mock') return new MockTranslator();
  return new PassthroughTranslator();
}

/**
 * LanguageDetector port (inbound: detect language + translate to English):
 *   detectAndTranslate(text, { hintLang }) -> Promise<{ code, englishText, confidence }>
 *
 * callModel(messages) must resolve to the gateway assistant reply text. When
 * translation is off (or no callModel is supplied) this is a no-op that treats
 * everything as English.
 */
export function createDetector(env = process.env, { callModel } = {}) {
  const provider = (env.TRANSLATION_PROVIDER ?? 'none').toLowerCase();
  if (provider === 'none' || typeof callModel !== 'function') {
    return new NullLanguageDetector();
  }
  return new GatewayLanguageDetector({ callModel });
}

/**
 * One multilingual chat turn:
 *   1. detect the member's language AND translate their message to English (1 gateway call)
 *   2. run the English-only pipeline (intent, RAG, compose) unchanged
 *   3. translate the English reply back to the member's language via Vulavula
 * Degrades to English on any translation failure so chat never breaks.
 *
 * storedLang is the language remembered for this conversation (null on the first
 * turn). The caller persists the returned langUsed for the next turn.
 */
export async function runMultilingualTurn({ detector, translator, storedLang, userText, runEnglishPipeline }) {
  const hintLang = storedLang ?? ENGLISH_CODE;
  const { code, englishText, confidence } = await detector.detectAndTranslate(userText, { hintLang });

  const languageCode = confidence >= MIN_DETECTION_CONFIDENCE ? code : hintLang;
  const englishReply = await runEnglishPipeline(englishText);

  if (isEnglish(languageCode)) {
    return { reply: englishReply, langUsed: ENGLISH_CODE, degraded: false };
  }

  try {
    const localisedReply = await translator.fromEnglish(englishReply, languageCode);
    return { reply: localisedReply, langUsed: languageCode, degraded: false };
  } catch (outboundError) {
    console.error('[translation] outbound failed, returning English reply', outboundError);
    return { reply: englishReply, langUsed: ENGLISH_CODE, degraded: true };
  }
}
