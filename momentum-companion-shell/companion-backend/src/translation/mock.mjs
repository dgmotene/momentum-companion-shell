// Deterministic offline translator for demos, video capture, and tests.
// Known phrases come from the fixture map; unknown phrases pass through
// unchanged so it never silently corrupts text and never spends Vulavula quota.
import { ENGLISH_CODE } from './languages.mjs';

export class MockTranslator {
  constructor({ fixtures = {} } = {}) {
    this.fixtures = fixtures; // keyed as `${sourceLang}|${targetLang}|${text}`
  }

  async toEnglish(text, sourceLangCode) {
    return this.#lookup(text, sourceLangCode, ENGLISH_CODE);
  }

  async fromEnglish(text, targetLangCode) {
    return this.#lookup(text, ENGLISH_CODE, targetLangCode);
  }

  #lookup(text, sourceLang, targetLang) {
    const fixtureKey = `${sourceLang}|${targetLang}|${text}`;
    return fixtureKey in this.fixtures ? this.fixtures[fixtureKey] : text;
  }
}
