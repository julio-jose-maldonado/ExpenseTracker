import { Writable } from 'node:stream';
import { getClientIp } from '../../src/Context/GetClientIp';
import { runWithRequestContext } from '../../src/Context/RunWithRequestContext';
import { createLogger } from '../../src/Logs/CreateLogger';

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

describe('RequestContext: IP del cliente', () => {
  it('devuelve la IP del contexto, incluso después de un await', async () => {
    await runWithRequestContext({ requestId: 'req-123', clientIp: '203.0.113.7' }, async () => {
      await Promise.resolve();
      expect(getClientIp()).toBe('203.0.113.7');
    });
  });

  it('devuelve undefined si el contexto no tiene IP o no hay contexto', () => {
    runWithRequestContext({ requestId: 'req-123' }, () => expect(getClientIp()).toBeUndefined());
    expect(getClientIp()).toBeUndefined();
  });

  it('el logger agrega client_ip a cada línea cuando el contexto la tiene', () => {
    const { logger, lines } = createCapturingLogger();

    runWithRequestContext({ requestId: 'req-123', clientIp: '203.0.113.7' }, () => logger.info('hola'));

    expect(lines).toEqual([expect.objectContaining({ request_id: 'req-123', client_ip: '203.0.113.7' })]);
  });

  it('el logger no agrega client_ip si el contexto no la tiene', () => {
    const { logger, lines } = createCapturingLogger();

    runWithRequestContext({ requestId: 'req-123' }, () => logger.info('hola'));

    expect(lines[0]).not.toHaveProperty('client_ip');
  });
});
