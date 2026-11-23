import { Writable } from 'node:stream';
import { createLogger } from '../../src/Logs/CreateLogger';
import { createTranslator } from '../../src/Translations/CreateTranslator';
import { es } from '../../src/Translations/es/translation';
import { TranslationKeys } from '../../src/Translations/TranslationKeys';

function createCapturingLogger() {
  const lines: Array<Record<string, unknown>> = [];
  const logger = createLogger(
    'core-test',
    new Writable({
      write: (chunk: Buffer, _encoding, done) => {
        lines.push(JSON.parse(chunk.toString()) as Record<string, unknown>);
        done();
      },
    }),
  );
  return { logger, lines };
}

describe('createTranslator', () => {
  it('devuelve el texto en español de una clave', () => {
    const translate = createTranslator(createCapturingLogger().logger);

    expect(translate(TranslationKeys.errors.NOT_FOUND)).toBe(es.errors.NOT_FOUND);
  });

  it('no escapa caracteres: el texto va a un JSON, no a HTML', () => {
    const translate = createTranslator(createCapturingLogger().logger);

    expect(translate(TranslationKeys.errors.INTERNAL)).toBe('Ocurrió un error inesperado. Intentá de nuevo más tarde.');
  });

  it('con una clave que no existe devuelve el mensaje genérico y lo avisa en el log', () => {
    const { logger, lines } = createCapturingLogger();
    const translate = createTranslator(logger);

    expect(translate('errors.NO_EXISTE')).toBe(es.errors.INTERNAL);
    expect(lines).toEqual([
      expect.objectContaining({ level: 'warn', message: 'translation not found', translation_key: 'errors.NO_EXISTE' }),
    ]);
  });

  it('con un idioma que no está cargado usa el español', () => {
    const translate = createTranslator(createCapturingLogger().logger);

    expect(translate(TranslationKeys.errors.NOT_FOUND, 'fr')).toBe(es.errors.NOT_FOUND);
  });
});
