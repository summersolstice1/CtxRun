import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { translations } from '@/lib/i18n';

// Convert the translations object to i18next format
const resources = {
  en: { translation: translations.en },
  zh: { translation: translations.zh }
};

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: 'en',
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false,
      prefix: '{',
      suffix: '}'
    }
  });

export default i18n;
