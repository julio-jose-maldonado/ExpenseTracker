import { errorCodeFromError } from '../src/Shared/Http/ErrorCodeFromError';

describe('errorCodeFromError', () => {
  // Así falla el router de Express cuando un parámetro de la ruta trae una codificación inválida (`/items/%zz`):
  // un URIError con status 400 y sin `expose`.
  it('un parámetro de ruta mal codificado es un request ilegible, no un error interno', () => {
    let error: unknown;
    try {
      decodeURIComponent('%zz');
    } catch (caught) {
      error = Object.assign(caught as Error, { status: 400 });
    }

    expect(errorCodeFromError(error)).toBe('MALFORMED_REQUEST');
  });

  it('un URIError sin status 400 (un bug propio) sigue siendo interno', () => {
    expect(errorCodeFromError(new URIError('boom'))).toBe('INTERNAL');
  });
});
