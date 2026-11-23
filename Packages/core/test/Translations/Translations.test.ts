import { ErrorCode } from '../../src/Errors/ErrorCode';
import { es } from '../../src/Translations/es/translation';
import { TranslationKeys } from '../../src/Translations/TranslationKeys';

// Devuelve el texto que está en esa clave (`errors.NOT_FOUND`) dentro del archivo de un idioma.
function textAt(translations: object, key: string): unknown {
  return key.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], translations);
}

function leafValues(node: object): string[] {
  return Object.values(node).flatMap((value) => (typeof value === 'string' ? [value] : leafValues(value as object)));
}

describe('Traducciones', () => {
  it.each(Object.values(ErrorCode))('hay un mensaje en español para el código %s', (code) => {
    expect(es.errors[code]).toEqual(expect.stringMatching(/\S/));
  });

  it.each(Object.values(ErrorCode))('la clave del código %s es su ruta dentro del archivo', (code) => {
    expect(TranslationKeys.errors[code]).toBe(`errors.${code}`);
  });

  it('cada clave apunta a un texto que existe en español', () => {
    for (const key of leafValues(TranslationKeys)) {
      expect(textAt(es, key)).toEqual(expect.stringMatching(/\S/));
    }
  });
});
