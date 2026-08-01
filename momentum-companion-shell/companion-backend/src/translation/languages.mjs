// Vulavula-supported translation languages, confirmed against
// https://docs.lelapa.ai/overview/language-support
export const SUPPORTED_LANGUAGES = [
  { code: 'eng_Latn', label: 'English' },
  { code: 'zul_Latn', label: 'isiZulu' },
  { code: 'xho_Latn', label: 'isiXhosa' },
  { code: 'afr_Latn', label: 'Afrikaans' },
  { code: 'sot_Latn', label: 'Sesotho' },
  { code: 'nso_Latn', label: 'Sepedi (Northern Sotho)' },
  { code: 'tsn_Latn', label: 'Setswana' },
  { code: 'tso_Latn', label: 'Xitsonga' },
  { code: 'ssw_Latn', label: 'siSwati' },
  { code: 'swh_Latn', label: 'Swahili' },
  { code: 'hau_Latn', label: 'Hausa' },
  { code: 'yor_Latn', label: 'Yoruba' },
  { code: 'sna_Latn', label: 'Shona' },
];

export const ENGLISH_CODE = 'eng_Latn';

const supportedCodes = new Set(SUPPORTED_LANGUAGES.map((language) => language.code));
const labelByCode = new Map(SUPPORTED_LANGUAGES.map((language) => [language.code, language.label]));

export const isSupportedLanguage = (languageCode) => supportedCodes.has(languageCode);
export const isEnglish = (languageCode) => !languageCode || languageCode === ENGLISH_CODE;
export const languageLabel = (languageCode) => labelByCode.get(languageCode) ?? languageCode;
