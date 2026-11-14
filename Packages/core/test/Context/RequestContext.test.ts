import { getRequestId } from '../../src/Context/GetRequestId';
import { runWithRequestId } from '../../src/Context/RunWithRequestId';

describe('RequestContext', () => {
  it('devuelve el requestId dentro del contexto, incluso después de un await', async () => {
    await runWithRequestId('req-123', async () => {
      await Promise.resolve();
      expect(getRequestId()).toBe('req-123');
    });
  });

  it('no devuelve requestId fuera de un contexto', () => {
    expect(getRequestId()).toBeUndefined();
  });
});
