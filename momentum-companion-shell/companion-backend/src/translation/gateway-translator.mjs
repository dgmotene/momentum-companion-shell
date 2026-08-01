import { ENGLISH_CODE, isSupportedLanguage, languageLabel } from './languages.mjs';

// Translates via the Momentum AI Gateway model (Haiku) instead of Vulavula.
// Two purposes: (1) A/B the gateway model against Vulavula to decide which
// translates the target languages better, and (2) act as a fallback translator
// when Vulavula is unavailable or over quota. callModel(messages) must resolve
// to the assistant's reply text (OpenAI-compatible chat/completions content).
export class GatewayTranslator {
  constructor({ callModel }) {
    if (typeof callModel !== 'function') {
      throw new Error('GatewayTranslator requires a callModel function');
    }
    this.callModel = callModel;
  }

  toEnglish(text, sourceLangCode) {
    return this.#translate(text, sourceLangCode, ENGLISH_CODE);
  }

  fromEnglish(text, targetLangCode) {
    return this.#translate(text, ENGLISH_CODE, targetLangCode);
  }

  async #translate(text, sourceLang, targetLang) {
    const trimmedText = (text ?? '').trim();
    if (!trimmedText || sourceLang === targetLang) return trimmedText;
    if (!isSupportedLanguage(sourceLang) || !isSupportedLanguage(targetLang)) {
      throw new Error(`Unsupported language pair ${sourceLang} -> ${targetLang}`);
    }

    const messages = [
      { role: 'system', content: buildTranslationPrompt(sourceLang, targetLang) },
      { role: 'user', content: trimmedText },
    ];

    const reply = await this.callModel(messages);
    if (typeof reply !== 'string' || !reply.trim()) {
      throw new Error('Gateway translation returned an empty reply');
    }
    return reply.trim();
  }
}

export function buildTranslationPrompt(sourceLang, targetLang) {
  return [
    'You are a translator for a life-insurance chat assistant.',
    `Translate the message from ${languageLabel(sourceLang)} into ${languageLabel(targetLang)}.`,
    'Keep numbers, currency amounts, dates, and policy or reference numbers exactly as written.',
    'Use clear, plain wording a member would understand.',
    'Respond with ONLY the translation: no quotes, no explanation, no preamble.',
  ].join(' ');
}
