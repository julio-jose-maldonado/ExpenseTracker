import { Writable } from 'node:stream';
import { createLogger } from '@expense-tracker/core';
import { InMemoryRateLimitStore } from '../src/Shared/RateLimit/InMemoryRateLimitStore';

describe('InMemoryRateLimitStore', () => {
  it('cuenta de a uno por clave', async () => {
    const store = new InMemoryRateLimitStore();

    expect(await store.increment('a', 60)).toBe(1);
    expect(await store.increment('a', 60)).toBe(2);
    expect(await store.increment('b', 60)).toBe(1);
  });

  it('una clave vencida vuelve a empezar', async () => {
    let nowMs = 0;
    const store = new InMemoryRateLimitStore(() => nowMs);

    await store.increment('a', 60);
    nowMs = 60_000;

    expect(await store.increment('a', 60)).toBe(1);
  });

  it('una clave que venció entre dos limpiezas también vuelve a empezar', async () => {
    let nowMs = 0;
    const store = new InMemoryRateLimitStore(() => nowMs);
    await store.increment('x', 60);
    nowMs = 500;
    await store.increment('a', 1);
    nowMs = 1_000;
    await store.increment('b', 1);
    // 'a' venció a los 1.500 ms; la próxima limpieza periódica recién es a los 2.000.
    nowMs = 1_600;

    expect(await store.increment('a', 1)).toBe(1);
  });

  it('descarta las claves vencidas para no crecer sin límite', async () => {
    let nowMs = 0;
    const store = new InMemoryRateLimitStore(() => nowMs);

    await store.increment('a', 1);
    await store.increment('b', 60);
    nowMs = 2_000;
    await store.increment('c', 60);

    expect(store.size).toBe(2);
  });

  it('con el tope de claves lleno, una clave nueva pasa sin contarse', async () => {
    const store = new InMemoryRateLimitStore(() => 0, 2);
    await store.increment('a', 60);
    await store.increment('b', 60);

    expect(await store.increment('c', 60)).toBe(0);
    expect(await store.increment('c', 60)).toBe(0);
    expect(store.size).toBe(2);
  });

  it('con el tope de claves lleno, no pierde los conteos vigentes', async () => {
    const store = new InMemoryRateLimitStore(() => 0, 2);
    await store.increment('a', 60);
    await store.increment('a', 60);
    await store.increment('b', 60);

    await store.increment('c', 60);

    expect(await store.increment('a', 60)).toBe(3);
  });

  it('con el tope lleno, antes de dejar pasar una clave nueva descarta las vencidas', async () => {
    let nowMs = 0;
    const store = new InMemoryRateLimitStore(() => nowMs, 2);
    await store.increment('a', 1);
    nowMs = 500;
    await store.increment('b', 1);
    nowMs = 1_200;
    await store.increment('c', 60);
    // 'b' venció a los 1.500 ms, pero la limpieza periódica ya corrió en este segundo.
    nowMs = 1_600;

    expect(await store.increment('d', 60)).toBe(1);
    expect(store.size).toBe(2);
  });

  it('con el tope lleno y el reloj quieto, las claves nuevas no recorren el mapa cada vez', async () => {
    const store = new InMemoryRateLimitStore(() => 0, 100_000);
    for (let i = 0; i < 100_000; i++) await store.increment(`k${i}`, 60);

    // Recorriendo el mapa en cada una serían 2.000 millones de vueltas. Margen amplio para CI y Stryker:
    // normalmente tarda unos ms, y la versión con el error tardaba 295 s.
    const started = performance.now();
    for (let i = 0; i < 20_000; i++) await store.increment(`n${i}`, 60);

    expect(performance.now() - started).toBeLessThan(3_000);
  });

  it('con el tope lleno y una clave venciendo por milisegundo, no recorre el mapa en cada request', async () => {
    let nowMs = 0;
    const store = new InMemoryRateLimitStore(() => nowMs, 20_000);
    // Como en un ataque real: cada clave entra en un milisegundo distinto, así vencen de a una.
    for (let i = 0; i < 20_000; i++) {
      nowMs = i;
      await store.increment(`k${i}`, 100);
    }

    // Recorriendo el mapa cada vez que vence una clave serían 400 millones de vueltas (59 s).
    const started = performance.now();
    for (let i = 0; i < 20_000; i++) {
      nowMs = 100_000 + i;
      await store.increment(`n${i}`, 100);
    }

    expect(performance.now() - started).toBeLessThan(3_000);
  });

  it('con el tope lleno avisa en el log a lo sumo una vez por intervalo', async () => {
    let nowMs = 0;
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
    const store = new InMemoryRateLimitStore(() => nowMs, 1, logger);
    await store.increment('a', 120);

    await store.increment('b', 120);
    await store.increment('c', 120);
    nowMs = 31_000;
    await store.increment('d', 120);

    expect(lines.filter((line) => line.level === 'warn')).toEqual([
      expect.objectContaining({ message: 'rate limit memory store full: new keys are not being limited' }),
      expect.objectContaining({ message: 'rate limit memory store full: new keys are not being limited' }),
    ]);
  });

  it('por defecto mide los vencimientos con un reloj que no salta cuando se ajusta la hora del sistema', async () => {
    const realNow = Date.now.bind(Date);
    let jumpMs = 0;
    const spy = jest.spyOn(Date, 'now').mockImplementation(() => realNow() + jumpMs);
    try {
      const store = new InMemoryRateLimitStore();
      await store.increment('a', 60);
      // La hora del sistema salta 2 minutos (ajuste de NTP): el conteo no tiene que reiniciarse.
      jumpMs = 120_000;

      expect(await store.increment('a', 60)).toBe(2);
    } finally {
      spy.mockRestore();
    }
  });

  it('sin tope explícito admite 100.000 claves', async () => {
    const store = new InMemoryRateLimitStore(() => 0);

    for (let i = 0; i <= 100_000; i++) await store.increment(String(i), 60);

    expect(store.size).toBe(100_000);
  });
});
