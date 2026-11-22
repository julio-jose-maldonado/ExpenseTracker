import { createInstance } from 'i18next';
import type { Logger } from 'pino';
import { es } from './es/translation';
import { TranslationKeys } from './TranslationKeys';

const DEFAULT_LANGUAGE = 'es';

// Devuelve el texto de una clave (`TranslationKeys...`) en el idioma pedido.
export type Translate = (key: string, language?: string) => string;

// Todo texto que llega al usuario final sale de acá. Por ahora solo español:
// la elección de idioma por usuario llega en la historia #10 (otro archivo de idioma en `resources`).
export function createTranslator(logger: Logger): Translate {
  const i18n = createInstance();
  void i18n.init({
    lng: DEFAULT_LANGUAGE,
    fallbackLng: DEFAULT_LANGUAGE,
    resources: { es: { translation: es } },
    initAsync: false,
    // Los textos van en un JSON, no en HTML: no hay que escapar nada.
    interpolation: { escapeValue: false },
  });

  return (key, language = DEFAULT_LANGUAGE) => {
    if (i18n.exists(key)) return i18n.t(key, { lng: language });
    // Una clave sin texto es un bug: el usuario recibe el mensaje genérico en vez de la clave cruda.
    logger.warn({ translation_key: key }, 'translation not found');
    return i18n.t(TranslationKeys.errors.INTERNAL, { lng: language });
  };
}
