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

  it('el log del error no incluye la contraseña de la URL', async () => {
    const { logger, lines } = createCapturingLogger();
    const client = createValkeyClient('redis://user:hunter2@127.0.0.1:1', logger);

    await new Promise((resolve) => setTimeout(resolve, 300));
    client.disconnect();

    expect(lines.length).toBeGreaterThan(0);
    expect(JSON.stringify(lines)).not.toContain('hunter2');
  });
});
