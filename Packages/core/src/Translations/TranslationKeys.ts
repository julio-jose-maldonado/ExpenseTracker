import type { Translations } from './Translations';

// Las claves para pedirle un texto a i18next: la misma forma que un archivo de idioma,
// con la ruta de cada texto como valor. Se usa `TranslationKeys.errors.NOT_FOUND` en vez de escribir la ruta a mano.
export const TranslationKeys: Translations = {
  errors: {
    INTERNAL: 'errors.INTERNAL',
    NOT_FOUND: 'errors.NOT_FOUND',
    SERVICE_UNAVAILABLE: 'errors.SERVICE_UNAVAILABLE',
    MALFORMED_REQUEST: 'errors.MALFORMED_REQUEST',
    PAYLOAD_TOO_LARGE: 'errors.PAYLOAD_TOO_LARGE',
    TOO_MANY_REQUESTS: 'errors.TOO_MANY_REQUESTS',
  },
};
