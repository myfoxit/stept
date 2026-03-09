import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import en from './locales/en.json';
import de from './locales/de.json';

export const SUPPORTED_LANGUAGES = {
  en: { name: 'English', nativeName: 'English', flag: '🇬🇧' },
  de: { name: 'German', nativeName: 'Deutsch', flag: '🇩🇪' },
  es: { name: 'Spanish', nativeName: 'Español', flag: '🇪🇸' },
  fr: { name: 'French', nativeName: 'Français', flag: '🇫🇷' },
  'pt-BR': { name: 'Portuguese (Brazil)', nativeName: 'Português (Brasil)', flag: '🇧🇷' },
  it: { name: 'Italian', nativeName: 'Italiano', flag: '🇮🇹' },
  ja: { name: 'Japanese', nativeName: '日本語', flag: '🇯🇵' },
  ko: { name: 'Korean', nativeName: '한국어', flag: '🇰🇷' },
  'zh-CN': { name: 'Chinese (Simplified)', nativeName: '简体中文', flag: '🇨🇳' },
  nl: { name: 'Dutch', nativeName: 'Nederlands', flag: '🇳🇱' },
  ru: { name: 'Russian', nativeName: 'Русский', flag: '🇷🇺' },
} as const;

export type LanguageCode = keyof typeof SUPPORTED_LANGUAGES;

// Content translation languages (all except 'en' which is the source)
export const CONTENT_LANGUAGES = Object.entries(SUPPORTED_LANGUAGES)
  .filter(([code]) => code !== 'en')
  .map(([code, info]) => ({ code, ...info }));

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      de: { translation: de },
    },
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false,
    },
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
      lookupLocalStorage: 'ondoki-ui-language',
    },
  });

export default i18n;
