import { createInstance, type i18n } from 'i18next';
import { es } from './Locales/es';

// Por ahora solo español. La elección de idioma por usuario llega en la historia #10.
export function createI18n(): i18n {
  const instance = createInstance();
  void instance.init({
    lng: 'es',
    fallbackLng: 'es',
    resources: { es: { translation: es } },
    initAsync: false,
    interpolation: { escapeValue: false },
  });
  return instance;
}
