import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { createSilentLogger } from '@expense-tracker/testing';
import { ValkeyRateLimitStore } from '../../src/Shared/RateLimit/ValkeyRateLimitStore';
import { createValkeyClient } from '../../src/Shared/Valkey/CreateValkeyClient';

// Contra el Valkey de docker compose. Sin la variable, el puerto por defecto del compose.
const VALKEY_URL = process.env.VALKEY_URL ?? 'redis://127.0.0.1:6380';

const client = createValkeyClient(VALKEY_URL, createSilentLogger('gateway'));
const store = new ValkeyRateLimitStore(client);
// Claves propias de esta corrida, para no chocar con otra ni con datos viejos.
const key = (name: string) => `test:${randomUUID()}:${name}`;

// El cliente no encola comandos sin conexión: se espera a que esté lista.
beforeAll(() => once(client, 'ready'));
afterAll(() => client.quit());

describe('ValkeyRateLimitStore', () => {
  it('cuenta de a uno por clave', async () => {
    const a = key('a');

    expect(await store.increment(a, 60)).toBe(1);
    expect(await store.increment(a, 60)).toBe(2);
    expect(await store.increment(key('b'), 60)).toBe(1);
  });

  it('la clave vence sola: queda con el tiempo de vida pedido', async () => {
    const a = key('a');

    await store.increment(a, 60);
    await store.increment(a, 60);
    const ttl = await client.ttl(a);

    expect(ttl).toBeGreaterThan(55);
    expect(ttl).toBeLessThanOrEqual(60);
  });

  it('requests simultáneos no pierden cuentas', async () => {
    const a = key('a');

    const counts = await Promise.all(Array.from({ length: 50 }, () => store.increment(a, 60)));

    expect(counts.toSorted((x, y) => x - y)).toEqual(Array.from({ length: 50 }, (_, i) => i + 1));
  });

  it('una clave vencida vuelve a empezar', async () => {
    const a = key('a');

    await store.increment(a, 1);
    await new Promise((resolve) => setTimeout(resolve, 1_100));

    expect(await store.increment(a, 1)).toBe(1);
  });
});
