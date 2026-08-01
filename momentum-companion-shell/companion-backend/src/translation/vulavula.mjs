import { ENGLISH_CODE, isSupportedLanguage } from './languages.mjs';

const VULAVULA_ENDPOINT = 'https://api.lelapa.ai/v1/translate/process';
const MAX_WORDS_PER_REQUEST = 80; // stay under Vulavula's ~100-word guidance

// Talks to the Vulavula translation API. In the multilingual turn it is used for
// the outbound leg (English reply -> the member's language), which is the text
// the member actually reads. fetchImpl is injectable so tests can drive it
// without hitting the network.
export class VulavulaTranslator {
  constructor({ apiToken, endpoint = VULAVULA_ENDPOINT, fetchImpl = fetch }) {
    if (!apiToken) throw new Error('VulavulaTranslator requires an apiToken');
    this.apiToken = apiToken;
    this.endpoint = endpoint;
    this.fetchImpl = fetchImpl;
    this.translationCache = new Map();
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

    const chunks = splitIntoWordChunks(trimmedText, MAX_WORDS_PER_REQUEST);
    const translatedChunks = [];
    for (const chunk of chunks) {
      translatedChunks.push(await this.#translateChunk(chunk, sourceLang, targetLang));
    }
    return translatedChunks.join(' ');
  }

  async #translateChunk(chunk, sourceLang, targetLang) {
    const cacheKey = `${sourceLang}|${targetLang}|${chunk}`;
    if (this.translationCache.has(cacheKey)) return this.translationCache.get(cacheKey);

    const response = await this.fetchImpl(this.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CLIENT-TOKEN': this.apiToken,
      },
      body: JSON.stringify({
        input_text: chunk,
        source_lang: sourceLang,
        target_lang: targetLang,
      }),
    });

    if (!response.ok) {
      const errorDetail = await response.text().catch(() => '');
      throw new Error(`Vulavula ${response.status}: ${errorDetail.slice(0, 200)}`);
    }

    const payload = await response.json();
    const translatedText = payload?.translation?.[0]?.translated_text;
    if (typeof translatedText !== 'string') {
      throw new Error('Vulavula response missing translation[0].translated_text');
    }

    this.translationCache.set(cacheKey, translatedText);
    return translatedText;
  }
}

// Packs whole sentences into chunks under the word cap. A single sentence longer
// than the cap is left intact (the limit is a soft recommendation, not a hard error).
export function splitIntoWordChunks(text, maxWords) {
  const sentences = text.match(/[^.!?]+[.!?]*\s*/g) ?? [text];
  const chunks = [];
  let currentChunk = '';
  let currentWordCount = 0;

  for (const sentence of sentences) {
    const sentenceWordCount = sentence.trim().split(/\s+/).length;
    if (currentWordCount + sentenceWordCount > maxWords && currentChunk) {
      chunks.push(currentChunk.trim());
      currentChunk = '';
      currentWordCount = 0;
    }
    currentChunk += sentence;
    currentWordCount += sentenceWordCount;
  }

  if (currentChunk.trim()) chunks.push(currentChunk.trim());
  return chunks;
}
