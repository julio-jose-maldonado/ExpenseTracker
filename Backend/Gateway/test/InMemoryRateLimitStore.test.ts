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

  it('descarta las claves vencidas para no crecer sin límite', async () => {
    let nowMs = 0;
    const store = new InMemoryRateLimitStore(() => nowMs);

    await store.increment('a', 1);
    await store.increment('b', 60);
    nowMs = 2_000;
    await store.increment('c', 60);

    expect(store.size).toBe(2);
  });

  it('con el tope de claves lleno, las claves nuevas comparten un contador de desborde', async () => {
    const store = new InMemoryRateLimitStore(() => 0, 2);
    await store.increment('a', 60);
    await store.increment('b', 60);

    expect(await store.increment('c', 60)).toBe(1);
    expect(await store.increment('d', 60)).toBe(2);
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

  it('el contador de desborde vence como cualquier clave', async () => {
    let nowMs = 0;
    const store = new InMemoryRateLimitStore(() => nowMs, 2);
    await store.increment('a', 120);
    await store.increment('b', 120);
    await store.increment('c', 60);
    nowMs = 60_000;

    expect(await store.increment('d', 60)).toBe(1);
  });

  it('cuando vencen claves y hay lugar, una clave nueva vuelve a tener su propio contador', async () => {
    let nowMs = 0;
    const store = new InMemoryRateLimitStore(() => nowMs, 2);
    await store.increment('a', 1);
    await store.increment('b', 1);
    await store.increment('c', 60);
    nowMs = 2_000;

    expect(await store.increment('d', 60)).toBe(1);
    expect(await store.increment('e', 60)).toBe(1);
    expect(store.size).toBe(2);
  });

  it('sin tope explícito admite 100.000 claves', async () => {
    const store = new InMemoryRateLimitStore(() => 0);

    for (let i = 0; i <= 100_000; i++) await store.increment(String(i), 60);

    expect(store.size).toBe(100_000);
  });
});
