import { createInstance } from 'i18next';
import { initReactI18next } from 'react-i18next';
import { en } from './locales/en';
import { es, type Messages } from './locales/es';

// Instancia propia (no la global de i18next). initReactI18next la deja disponible para useTranslation.
// Español por defecto. La elección de idioma por usuario llega con la historia #10.
export const i18n = createInstance();

void i18n.use(initReactI18next).init({
  lng: 'es',
  fallbackLng: 'es',
  resources: { es: { translation: es }, en: { translation: en } },
  initAsync: false,
  // React ya escapa lo que renderiza.
  interpolation: { escapeValue: false },
});

declare module 'i18next' {
  interface CustomTypeOptions {
    resources: { translation: Messages };
  }
}
