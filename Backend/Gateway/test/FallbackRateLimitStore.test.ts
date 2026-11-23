import { Writable } from 'node:stream';
import { createLogger } from '@expense-tracker/core';
import { FallbackRateLimitStore } from '../src/Shared/RateLimit/FallbackRateLimitStore';
import { InMemoryRateLimitStore } from '../src/Shared/RateLimit/InMemoryRateLimitStore';
import type { IRateLimitStore } from '../src/Shared/RateLimit/IRateLimitStore';

const NOW_MS = 1_000_000;

function createLines() {
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

// Contador principal que se puede tirar y levantar desde el test.
function createPrimary() {
  const counts = new Map<string, number>();
  const state = { down: false };
  const store: IRateLimitStore = {
    increment: (key) => {
      if (state.down) return Promise.reject(new Error('valkey down'));
      const count = (counts.get(key) ?? 0) + 1;
      counts.set(key, count);
      return Promise.resolve(count);
    },
  };
  return { store, state };
}

function createStore({ now = () => NOW_MS }: { now?: () => number } = {}) {
  const { logger, lines } = createLines();
  const primary = createPrimary();
  const fallback = new InMemoryRateLimitStore(now);
  const store = new FallbackRateLimitStore({ primary: primary.store, fallback, logger, now });
  return { store, primary, fallback, lines };
}

const errors = (lines: Array<Record<string, unknown>>) => lines.filter((line) => line.level === 'error');

describe('FallbackRateLimitStore', () => {
  it('con el principal andando cuenta ahí y no toca el respaldo', async () => {
    const { store, fallback } = createStore();

    expect(await store.increment('a', 60)).toBe(1);
    expect(await store.increment('a', 60)).toBe(2);
    expect(fallback.size).toBe(0);
  });

  it('si el principal falla, cuenta en el respaldo', async () => {
    const { store, primary } = createStore();
    primary.state.down = true;

    expect(await store.increment('a', 60)).toBe(1);
    expect(await store.increment('a', 60)).toBe(2);
  });

  it('registra la caída del principal a lo sumo una vez por intervalo', async () => {
    const { store, primary, lines } = createStore();
    primary.state.down = true;

    await store.increment('a', 60);
    await store.increment('a', 60);
    await store.increment('b', 60);

    expect(errors(lines)).toEqual([expect.objectContaining({ message: 'rate limit store failed: counting in memory per instance' })]);
  });

  it('vuelve a registrar la caída pasado el intervalo de aviso', async () => {
    let nowMs = NOW_MS;
    const { store, primary, lines } = createStore({ now: () => nowMs });
    primary.state.down = true;

    await store.increment('a', 60);
    nowMs += 31_000;
    await store.increment('a', 60);

    expect(errors(lines)).toHaveLength(2);
  });

  it('cuando el principal vuelve, cuenta ahí otra vez', async () => {
    let nowMs = NOW_MS;
    const { store, primary } = createStore({ now: () => nowMs });
    await store.increment('a', 60);
    primary.state.down = true;
    await store.increment('a', 60);
    await store.increment('a', 60);
    primary.state.down = false;
    // Pasado el corte automático. En el respaldo 'a' ya va por 2: si contara ahí, daría 3.
    nowMs += 5_000;

    expect(await store.increment('a', 60)).toBe(2);
  });
});

// Principal que cuenta las llamadas y deja controlar cuándo responde cada una.
function createControlledPrimary() {
  const pending: Array<{ resolve: (count: number) => void; reject: (error: Error) => void }> = [];
  const store: IRateLimitStore = {
    increment: () => new Promise<number>((resolve, reject) => pending.push({ resolve, reject })),
  };
  return { store, pending };
}

describe('FallbackRateLimitStore: corte automático', () => {
  function createBreakerStore() {
    let nowMs = NOW_MS;
    const { logger, lines } = createLines();
    const primary = createControlledPrimary();
    const fallback = new InMemoryRateLimitStore(() => nowMs);
    const store = new FallbackRateLimitStore({ primary: primary.store, fallback, logger, now: () => nowMs });
    return { store, primary, lines, advance: (ms: number) => (nowMs += ms) };
  }

  async function failFirstCall(store: FallbackRateLimitStore, primary: ReturnType<typeof createControlledPrimary>) {
    const first = store.increment('a', 60);
    primary.pending[0].reject(new Error('timeout'));
    await first;
  }

  it('después de un fallo no consulta al principal durante 5 s', async () => {
    const { store, primary, advance } = createBreakerStore();
    await failFirstCall(store, primary);

    advance(4_999);
    await store.increment('a', 60);
    await store.increment('a', 60);

    expect(primary.pending).toHaveLength(1);
  });

  it('pasados los 5 s vuelve a probar y, si responde, deja de usar el respaldo', async () => {
    const { store, primary, advance } = createBreakerStore();
    await failFirstCall(store, primary);

    advance(5_000);
    const probe = store.increment('a', 60);
    primary.pending[1].resolve(7);
    expect(await probe).toBe(7);

    const next = store.increment('a', 60);
    expect(primary.pending).toHaveLength(3);
    primary.pending[2].resolve(8);
    expect(await next).toBe(8);
  });

  it('si la prueba falla, corta otros 5 s', async () => {
    const { store, primary, advance } = createBreakerStore();
    await failFirstCall(store, primary);

    advance(5_000);
    const probe = store.increment('a', 60);
    primary.pending[1].reject(new Error('timeout'));
    await probe;
    advance(4_999);
    await store.increment('a', 60);

    expect(primary.pending).toHaveLength(2);
  });

  it('mientras la prueba espera respuesta, los demás requests cuentan en memoria sin esperar', async () => {
    const { store, primary, advance } = createBreakerStore();
    await failFirstCall(store, primary);

    advance(5_000);
    const probe = store.increment('a', 60);
    const others = await Promise.all([store.increment('b', 60), store.increment('b', 60), store.increment('b', 60)]);

    expect(others).toEqual([1, 2, 3]);
    expect(primary.pending).toHaveLength(2);
    primary.pending[1].resolve(1);
    await probe;
  });

  it('una respuesta tardía de un request anterior al corte no lo cierra', async () => {
    const { store, primary } = createBreakerStore();
    const before = store.increment('a', 60);
    const failing = store.increment('a', 60);
    primary.pending[1].reject(new Error('timeout'));
    await failing;
    primary.pending[0].resolve(1);
    await before;

    await store.increment('a', 60);

    expect(primary.pending).toHaveLength(2);
  });

  it('avisa en el log cuando el principal vuelve', async () => {
    const { store, primary, lines, advance } = createBreakerStore();
    await failFirstCall(store, primary);
    advance(5_000);

    const probe = store.increment('a', 60);
    primary.pending[1].resolve(1);
    await probe;

    expect(lines.filter((line) => line.level === 'info')).toEqual([
      expect.objectContaining({ message: 'rate limit store recovered: counting in Valkey again' }),
    ]);
  });

  it('la prueba cierra el corte aunque mientras esperaba hayan llegado otros requests', async () => {
    const { store, primary, advance } = createBreakerStore();
    await failFirstCall(store, primary);
    advance(5_000);
    const probe = store.increment('a', 60);
    await store.increment('b', 60);
    primary.pending[1].resolve(1);
    await probe;

    void store.increment('a', 60);

    expect(primary.pending).toHaveLength(3);
  });

  it('con el corte, el aviso de caída en el log sale a lo sumo cada 30 s aunque cada prueba falle', async () => {
    const { store, primary, lines, advance } = createBreakerStore();
    await failFirstCall(store, primary);
    for (let i = 1; i <= 6; i++) {
      advance(5_000);
      const probe = store.increment('a', 60);
      primary.pending[i].reject(new Error('timeout'));
      await probe;
    }

    expect(errors(lines)).toHaveLength(2);
  });
});

describe('FallbackRateLimitStore: consulta que no responde', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  function createHangingStore() {
    let nowMs = NOW_MS;
    const { logger, lines } = createLines();
    const primary = createControlledPrimary();
    const fallback = new InMemoryRateLimitStore(() => nowMs);
    const store = new FallbackRateLimitStore({ primary: primary.store, fallback, logger, now: () => nowMs });
    return { store, primary, lines, advance: (ms: number) => (nowMs += ms) };
  }

  it('si el principal no responde en 1 s, el request cuenta en memoria, se registra el fallo y se corta', async () => {
    const { store, primary, lines } = createHangingStore();

    const hanging = store.increment('a', 60);
    await jest.advanceTimersByTimeAsync(1_000);

    expect(await hanging).toBe(1);
    expect(errors(lines)).toHaveLength(1);
    await store.increment('a', 60);
    expect(primary.pending).toHaveLength(1);
  });

  it('una prueba que no responde en 1 s cuenta como fallo y corta otros 5 s', async () => {
    const { store, primary, advance } = createHangingStore();
    const first = store.increment('a', 60);
    await jest.advanceTimersByTimeAsync(1_000);
    await first;
    advance(5_000);

    const probe = store.increment('a', 60);
    await jest.advanceTimersByTimeAsync(1_000);
    await probe;
    advance(4_999);
    await store.increment('a', 60);
    expect(primary.pending).toHaveLength(2);

    advance(1);
    void store.increment('a', 60);
    expect(primary.pending).toHaveLength(3);
  });

  it('la respuesta tardía de una prueba que ya venció no cierra el corte ni libera a la prueba nueva', async () => {
    const { store, primary, advance } = createHangingStore();
    const first = store.increment('a', 60);
    await jest.advanceTimersByTimeAsync(1_000);
    await first;
    advance(5_000);
    const staleProbe = store.increment('a', 60);
    await jest.advanceTimersByTimeAsync(1_000);
    await staleProbe;

    primary.pending[1].resolve(1);
    await store.increment('a', 60);
    expect(primary.pending).toHaveLength(2);

    advance(5_000);
    void store.increment('a', 60);
    primary.pending[1].resolve(1);
    await store.increment('a', 60);
    expect(primary.pending).toHaveLength(3);
  });
});
