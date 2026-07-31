import { ENGLISH_CODE, isSupportedLanguage, SUPPORTED_LANGUAGES } from './languages.mjs';

const codeList = SUPPORTED_LANGUAGES
  .map((language) => `${language.code} (${language.label})`)
  .join(', ');

const DETECTION_SYSTEM_PROMPT = [
  'You are the language step for a life-insurance chat assistant.',
  'You receive one message from a member. Do two things:',
  '1. Identify the language it is written in, choosing exactly one code from this list:',
  `   ${codeList}.`,
  '2. Translate the message into clear English. If it is already English, return it unchanged.',
  'If the message is too short or ambiguous to be sure of the language, prefer the',
  'provided hint language and lower your confidence.',
  'Respond with ONLY a JSON object, no prose and no code fences, in this exact shape:',
  '{"code": "<one code from the list>", "english_text": "<the English translation>", "confidence": <number between 0 and 1>}',
].join('\n');

// Used when translation is disabled: treats everything as English, no model call.
export class NullLanguageDetector {
  async detectAndTranslate(text) {
    return { code: ENGLISH_CODE, englishText: text ?? '', confidence: 1 };
  }
}

// Detects the source language AND translates the message to English in a single
// gateway call. callModel(messages) must resolve to the assistant's reply text
// (OpenAI-compatible chat/completions content). Injecting callModel keeps this
// module decoupled from however the gateway client is built and makes it testable.
export class GatewayLanguageDetector {
  constructor({ callModel }) {
    if (typeof callModel !== 'function') {
      throw new Error('GatewayLanguageDetector requires a callModel function');
    }
    this.callModel = callModel;
  }

  async detectAndTranslate(text, { hintLang = ENGLISH_CODE } = {}) {
    const trimmedText = (text ?? '').trim();
    if (!trimmedText) return { code: ENGLISH_CODE, englishText: '', confidence: 1 };

    const messages = [
      { role: 'system', content: DETECTION_SYSTEM_PROMPT },
      { role: 'user', content: `Hint language (use if unsure): ${hintLang}\nMessage:\n${trimmedText}` },
    ];

    let rawReply;
    try {
      rawReply = await this.callModel(messages);
    } catch (modelError) {
      console.error('[translation] detection model call failed, assuming hint language', modelError);
      return { code: hintLang || ENGLISH_CODE, englishText: trimmedText, confidence: 0 };
    }

    const parsedDetection = parseDetectionReply(rawReply);
    if (!parsedDetection) {
      console.warn('[translation] could not parse detection reply, assuming hint language');
      return { code: hintLang || ENGLISH_CODE, englishText: trimmedText, confidence: 0 };
    }
    return parsedDetection;
  }
}

// Pulls the JSON object out of the model reply and validates it. Returns null if
// the reply cannot be trusted, so the caller can fall back safely. Tolerates the
// model wrapping the JSON in prose or code fences.
export function parseDetectionReply(rawReply) {
  if (typeof rawReply !== 'string') return null;
  const jsonStart = rawReply.indexOf('{');
  const jsonEnd = rawReply.lastIndexOf('}');
  if (jsonStart === -1 || jsonEnd <= jsonStart) return null;

  let parsed;
  try {
    parsed = JSON.parse(rawReply.slice(jsonStart, jsonEnd + 1));
  } catch {
    return null;
  }

  const englishText = parsed.english_text;
  if (typeof englishText !== 'string') return null;

  const code = isSupportedLanguage(parsed.code) ? parsed.code : ENGLISH_CODE;

  let confidence = Number(parsed.confidence);
  if (!Number.isFinite(confidence)) confidence = 0;
  confidence = Math.min(1, Math.max(0, confidence));

  return { code, englishText, confidence };
}
