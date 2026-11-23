import type { ErrorCode } from '../Errors/ErrorCode';

// La forma de un archivo de idioma. Cada idioma y TranslationKeys la cumplen:
// agregar un texto acá obliga a cargarlo en todos.
export interface Translations {
  // Un mensaje por cada código de error.
  errors: Record<ErrorCode, string>;
}
