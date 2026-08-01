// No-op translator: returned when translation is disabled or the reply is
// already in English. Lets the turn handler call the translator unconditionally
// without branching on whether translation is active.
export class PassthroughTranslator {
  async toEnglish(text) {
    return text;
  }

  async fromEnglish(text) {
    return text;
  }
}
