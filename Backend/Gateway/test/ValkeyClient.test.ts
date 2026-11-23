import { Writable } from 'node:stream';
import { createLogger } from '@expense-tracker/core';
import { ValkeyRateLimitStore } from '../src/Shared/RateLimit/ValkeyRateLimitStore';
import { createValkeyClient } from '../src/Shared/Valkey/CreateValkeyClient';

function createCapturingLogger() {
  const lines: Array<Record<string, unknown>> = [];
  const logger = createLogger(
    'gateway',
    new Writable({
      write: (chunk: Buffer, _encoding, done) => {
        lines.push(JSON.parse(chunk.toString()) as Record<string, unknown>);
        done();
      },
    }),
  );
  return { logger, lines };
}

// Puerto 1: no hay nada escuchando, la conexión se rechaza.
const UNREACHABLE_URL = 'redis://127.0.0.1:1';

describe('createValkeyClient: Valkey caído', () => {
  it('un comando falla rápido en vez de quedar esperando la reconexión', async () => {
    const { logger } = createCapturingLogger();
    const client = createValkeyClient(UNREACHABLE_URL, logger);
    const store = new ValkeyRateLimitStore(client);
    const start = Date.now();

    await expect(store.increment('a', 60)).rejects.toThrow("Stream isn't writeable");

    expect(Date.now() - start).toBeLessThan(1_000);
    client.disconnect();
  });

  it('el error de conexión se registra y no tira el proceso', async () => {
    const { logger, lines } = createCapturingLogger();
    const client = createValkeyClient(UNREACHABLE_URL, logger);

    await new Promise((resolve) => setTimeout(resolve, 300));
    client.disconnect();

    expect(lines).toContainEqual(expect.objectContaining({ level: 'error', message: 'valkey connection error' }));
  });

  it('con errores seguidos registra uno solo por intervalo', () => {
    const { logger, lines } = createCapturingLogger();
    const client = createValkeyClient(UNREACHABLE_URL, logger);

    client.emit('error', new Error('first'));
    client.emit('error', new Error('second'));
    client.emit('error', new Error('third'));
    client.disconnect();

    expect(lines.filter((line) => line.message === 'valkey connection error')).toHaveLength(1);
  });

  it('un salto de la hora del sistema no adelanta el próximo aviso', () => {
    const { logger, lines } = createCapturingLogger();
    const realNow = Date.now.bind(Date);
    let jumpMs = 0;
    const spy = jest.spyOn(Date, 'now').mockImplementation(() => realNow() + jumpMs);
    const client = createValkeyClient(UNREACHABLE_URL, logger);
    try {
      client.emit('error', new Error('first'));
      // La hora del sistema salta 31 s (ajuste de NTP): el intervalo de 30 s no pasó de verdad.
      jumpMs = 31_000;
      client.emit('error', new Error('second'));
    } finally {
      client.disconnect();
      spy.mockRestore();
    }

    expect(lines.filter((line) => line.message === 'valkey connection error')).toHaveLength(1);
  });

  it('el log del error no incluye la contraseña de la URL', async () => {
    const { logger, lines } = createCapturingLogger();
    const client = createValkeyClient('redis://user:hunter2@127.0.0.1:1', logger);

    await new Promise((resolve) => setTimeout(resolve, 300));
    client.disconnect();

    expect(lines.length).toBeGreaterThan(0);
    expect(JSON.stringify(lines)).not.toContain('hunter2');
  });
});
