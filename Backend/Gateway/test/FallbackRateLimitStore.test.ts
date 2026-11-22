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
    const { store, primary } = createStore();
    await store.increment('a', 60);
    primary.state.down = true;
    await store.increment('a', 60);
    primary.state.down = false;

    expect(await store.increment('a', 60)).toBe(2);
  });
});
