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
});
