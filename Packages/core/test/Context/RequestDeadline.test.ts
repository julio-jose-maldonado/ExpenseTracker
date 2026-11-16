import { getRequestDeadline } from '../../src/Context/GetRequestDeadline';
import { runWithRequestContext } from '../../src/Context/RunWithRequestContext';

describe('RequestContext: deadline', () => {
  it('devuelve el deadline del contexto, incluso después de un await', async () => {
    await runWithRequestContext({ requestId: 'req-123', deadline: 1_700_000_000_000 }, async () => {
      await Promise.resolve();
      expect(getRequestDeadline()).toBe(1_700_000_000_000);
    });
  });

  it('devuelve undefined si el request no trae deadline', () => {
    runWithRequestContext({ requestId: 'req-123' }, () => expect(getRequestDeadline()).toBeUndefined());
  });

  it('devuelve undefined fuera de un contexto', () => {
    expect(getRequestDeadline()).toBeUndefined();
  });
});
