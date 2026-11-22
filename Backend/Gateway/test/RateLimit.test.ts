import { Writable } from 'node:stream';
import { createLogger } from '@expense-tracker/core';
import request from 'supertest';
import { container } from 'tsyringe';
import { App } from '../src/App';
import { ICheckBusinessHealth } from '../src/Domains/Health/4.Repositories/CheckBusinessHealth/ICheckBusinessHealth';
import type { IRateLimitStore } from '../src/Shared/RateLimit/IRateLimitStore';
import { RATE_LIMITS, type RateLimitTable } from '../src/Shared/RateLimit/RateLimits';

// Inicio de una ventana de 60 s, más 15 s: a la ventana le quedan 45 s.
const WINDOW_START_MS = 60_000 * 28_000_000;
const NOW_MS = WINDOW_START_MS + 15_000;

const TABLE: RateLimitTable = {
  general: { perIp: { max: 3, windowSeconds: 60 } },
  overrides: {},
  exempt: ['GET /isAlive'],
};

interface Options {
  table?: RateLimitTable;
  store?: IRateLimitStore;
  now?: () => number;
}

function createApp({ table = TABLE, store, now = () => NOW_MS }: Options = {}) {
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
  // Un proxy de confianza: la IP del cliente es la que venga en X-Forwarded-For.
  return { app: new App(logger, { trustedProxyHops: 1, rateLimit: { table, store, now } }).server, lines };
}

const IP_A = '203.0.113.7';
const IP_B = '203.0.113.8';

async function hit(app: App['server'], path: string, ip = IP_A, times = 1) {
  let response = await request(app).get(path).set('x-forwarded-for', ip);
  for (let i = 1; i < times; i++) response = await request(app).get(path).set('x-forwarded-for', ip);
  return response;
}

beforeEach(() => {
  container.reset();
  container.register(ICheckBusinessHealth, { useValue: { check: () => Promise.resolve(true) } });
});

describe('Gateway rate limit: límite general', () => {
  it('deja pasar los requests hasta el límite', async () => {
    const { app } = createApp();

    const third = await hit(app, '/isAliveChain', IP_A, 3);

    expect(third.status).toBe(200);
  });

  it('pasado el límite responde 429 con el código, el mensaje traducido y Retry-After', async () => {
    const { app } = createApp();

    const fourth = await hit(app, '/isAliveChain', IP_A, 4);

    expect(fourth.status).toBe(429);
    expect(fourth.body).toEqual({
      error: { code: 'TOO_MANY_REQUESTS', message: 'Hiciste demasiadas solicitudes. Esperá un momento y volvé a intentar.' },
    });
    // Segundos que le quedan a la ventana.
    expect(fourth.headers['retry-after']).toBe('45');
  });

  it('el request rechazado no llega al endpoint', async () => {
    const check = jest.fn(() => Promise.resolve(true));
    container.register(ICheckBusinessHealth, { useValue: { check } });
    const { app } = createApp();

    await hit(app, '/isAliveChain', IP_A, 4);

    expect(check).toHaveBeenCalledTimes(3);
  });

  it('el request rechazado queda en el log con status 429', async () => {
    const { app, lines } = createApp();

    await hit(app, '/isAliveChain', IP_A, 4);

    expect(lines.at(-1)).toMatchObject({ message: 'request completed', status_code: 429, client_ip: IP_A });
  });

  it('en la ventana siguiente el contador vuelve a empezar', async () => {
    let nowMs = NOW_MS;
    const { app } = createApp({ now: () => nowMs });

    await hit(app, '/isAliveChain', IP_A, 4);
    nowMs = WINDOW_START_MS + 60_000;

    expect((await hit(app, '/isAliveChain')).status).toBe(200);
  });
});

describe('Gateway rate limit: contadores', () => {
  it('cada IP tiene su cuenta', async () => {
    const { app } = createApp();

    await hit(app, '/isAliveChain', IP_A, 4);

    expect((await hit(app, '/isAliveChain', IP_B)).status).toBe(200);
  });

  it('las direcciones IPv6 de un mismo bloque /64 comparten la cuenta', async () => {
    const { app } = createApp();

    await hit(app, '/isAliveChain', '2001:db8:1:2::1', 3);

    expect((await hit(app, '/isAliveChain', '2001:db8:1:2::2')).status).toBe(429);
    expect((await hit(app, '/isAliveChain', '2001:db8:1:3::1')).status).toBe(200);
  });

  it('cada endpoint tiene su cuenta: agotar uno no gasta el cupo de otro', async () => {
    const { app } = createApp();

    await hit(app, '/no-existe', IP_A, 4);

    expect((await hit(app, '/isAliveChain')).status).toBe(200);
  });

  it('las rutas que no existen comparten una sola cuenta por IP', async () => {
    const { app } = createApp();

    await hit(app, '/no-existe-1');
    await hit(app, '/no-existe-2');
    const third = await hit(app, '/no-existe-3');
    const fourth = await hit(app, '/no-existe-4');

    expect(third.status).toBe(404);
    expect(fourth.status).toBe(429);
  });

  it('un endpoint exento no tiene límite', async () => {
    const { app } = createApp();

    const last = await hit(app, '/isAlive', IP_A, 10);

    expect(last.status).toBe(200);
  });
});

describe('Gateway rate limit: reglas propias por endpoint', () => {
  it('una regla más baja reemplaza al límite general', async () => {
    const { app } = createApp({
      table: { ...TABLE, overrides: { 'GET /isAliveChain': { perIp: { max: 1, windowSeconds: 60 } } } },
    });

    const second = await hit(app, '/isAliveChain', IP_A, 2);

    expect(second.status).toBe(429);
  });

  it('una regla más alta reemplaza al límite general', async () => {
    const { app } = createApp({
      table: { ...TABLE, overrides: { 'GET /isAliveChain': { perIp: { max: 5, windowSeconds: 60 } } } },
    });

    const fifth = await hit(app, '/isAliveChain', IP_A, 5);
    const sixth = await hit(app, '/isAliveChain');

    expect(fifth.status).toBe(200);
    expect(sixth.status).toBe(429);
  });

  it('la regla usa su propia ventana para Retry-After', async () => {
    const { app } = createApp({
      table: { ...TABLE, overrides: { 'GET /isAliveChain': { perIp: { max: 1, windowSeconds: 10 } } } },
    });

    const second = await hit(app, '/isAliveChain', IP_A, 2);

    // NOW_MS cae 5 s después del inicio de una ventana de 10 s.
    expect(second.headers['retry-after']).toBe('5');
  });

  it.each([
    ['una regla propia', { ...TABLE, overrides: { 'GET /no-existe': { perIp: { max: 1, windowSeconds: 60 } } } }],
    ['una exención', { ...TABLE, exempt: ['GET /no-existe'] }],
  ])('no arranca si %s apunta a una ruta que no existe', (_name, table) => {
    expect(() => createApp({ table })).toThrow('GET /no-existe');
  });

  it('la tabla real solo tiene reglas de rutas que existen', () => {
    expect(() => createApp({ table: RATE_LIMITS })).not.toThrow();
  });
});

describe('Gateway rate limit: request con codificación inválida', () => {
  it('un path mal codificado se cuenta y responde como cualquier ruta que no existe', async () => {
    const { app } = createApp();

    const third = await hit(app, '/%zz', IP_A, 3);
    const fourth = await hit(app, '/%zz');

    expect(third.status).toBe(404);
    expect(fourth.status).toBe(429);
  });
});

describe('Gateway rate limit: si el contador falla', () => {
  const failingStore: IRateLimitStore = { increment: () => Promise.reject(new Error('valkey down')) };

  it('el request pasa igual', async () => {
    const { app } = createApp({ store: failingStore });

    const response = await hit(app, '/isAliveChain', IP_A, 5);

    expect(response.status).toBe(200);
  });

  it('registra el error, una sola vez aunque fallen varios requests seguidos', async () => {
    const { app, lines } = createApp({ store: failingStore });

    await hit(app, '/isAliveChain', IP_A, 3);

    const errors = lines.filter((line) => line.level === 'error');
    expect(errors).toEqual([expect.objectContaining({ message: 'rate limit store failed: requests are not being limited' })]);
  });

  it('vuelve a registrar el error pasado el intervalo de aviso', async () => {
    let nowMs = NOW_MS;
    const { app, lines } = createApp({ store: failingStore, now: () => nowMs });

    await hit(app, '/isAliveChain');
    nowMs += 31_000;
    await hit(app, '/isAliveChain');

    expect(lines.filter((line) => line.level === 'error')).toHaveLength(2);
  });
});

describe('Gateway rate limit: sin configuración', () => {
  it('sin opciones aplica la tabla real con un contador en memoria', async () => {
    const lines: unknown[] = [];
    const logger = createLogger('gateway', new Writable({ write: (chunk: Buffer, _e, done) => (lines.push(chunk), done()) }));
    // Reloj fijo: con el real, los requests podrían caer en dos ventanas de un segundo y no llegar al límite.
    const clock = jest.spyOn(Date, 'now').mockReturnValue(NOW_MS);
    const app = new App(logger).server;
    const { max } = RATE_LIMITS.general.perIp;

    let last = await request(app).get('/isAliveChain');
    for (let i = 0; i < max; i++) last = await request(app).get('/isAliveChain');
    clock.mockRestore();

    expect(last.status).toBe(429);
  });
});
