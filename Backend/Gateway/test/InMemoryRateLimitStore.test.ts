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

  it('con el tope de claves lleno, una clave nueva desplaza a la más vieja', async () => {
    const store = new InMemoryRateLimitStore(() => 0, 2);

    await store.increment('a', 60);
    await store.increment('b', 60);
    await store.increment('c', 60);

    expect(store.size).toBe(2);
    expect(await store.increment('b', 60)).toBe(2);
    expect(await store.increment('c', 60)).toBe(2);
  });

  it('sin tope explícito admite 100.000 claves', async () => {
    const store = new InMemoryRateLimitStore(() => 0);

    for (let i = 0; i <= 100_000; i++) await store.increment(String(i), 60);

    expect(store.size).toBe(100_000);
  });
});
