import { Writable } from 'node:stream';
import { createLogger } from '@expense-tracker/core';
import request from 'supertest';
import { App } from '../src/App';
import { loadEnvConfigs } from '../src/Config/EnvConfigs';

function createApp(options?: { trustedProxyHops: number }) {
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
  return { app: new App(logger, options).server, lines };
}

// supertest se conecta por loopback: 127.0.0.1, su forma IPv6 (::ffff:127.0.0.1) o ::1.
const LOOPBACK = /^(::ffff:)?127\.0\.0\.1$|^::1$/;

describe('Gateway: IP del cliente en los logs', () => {
  it('registra la IP de quien llamó en la línea del request', async () => {
    const { app, lines } = createApp();

    await request(app).get('/isAlive');

    expect(lines).toEqual([
      expect.objectContaining({ message: 'request completed', client_ip: expect.stringMatching(LOOPBACK) }),
    ]);
  });

  it('registra la IP también en un 404', async () => {
    const { app, lines } = createApp();

    await request(app).get('/no-existe');

    expect(lines).toEqual([expect.objectContaining({ status_code: 404, client_ip: expect.stringMatching(LOOPBACK) })]);
  });

  it('sin proxies de confianza ignora X-Forwarded-For: el cliente no puede inventar su IP', async () => {
    const { app, lines } = createApp();

    await request(app).get('/isAlive').set('x-forwarded-for', '198.51.100.99');

    expect(lines[0]?.client_ip).toMatch(LOOPBACK);
  });

  it('con un proxy de confianza toma la IP que agregó ese proxy', async () => {
    const { app, lines } = createApp({ trustedProxyHops: 1 });

    await request(app).get('/isAlive').set('x-forwarded-for', '203.0.113.7');

    expect(lines[0]?.client_ip).toBe('203.0.113.7');
  });

  it('con dos proxies de confianza descarta lo que el cliente haya puesto adelante', async () => {
    const { app, lines } = createApp({ trustedProxyHops: 2 });

    // De izquierda a derecha: inventada por el cliente, IP real (la agrega el primer proxy),
    // primer proxy (lo agrega el segundo).
    await request(app).get('/isAlive').set('x-forwarded-for', '198.51.100.99, 203.0.113.7, 10.0.0.5');

    expect(lines[0]?.client_ip).toBe('203.0.113.7');
  });

  it('si el valor reenviado no es una IP, usa la IP de la conexión', async () => {
    const { app, lines } = createApp({ trustedProxyHops: 1 });

    await request(app).get('/isAlive').set('x-forwarded-for', 'not-an-ip {"level":"fatal"}');

    expect(lines[0]?.client_ip).toMatch(LOOPBACK);
  });
});

describe('Gateway: TRUSTED_PROXY_HOPS', () => {
  const NAMES = ['PORT', 'BUSINESS_GRPC_ADDRESS', 'VALKEY_URL', 'TRUSTED_PROXY_HOPS'] as const;
  const original = NAMES.map((name) => [name, process.env[name]] as const);

  beforeEach(() => {
    process.env.PORT = '3000';
    process.env.BUSINESS_GRPC_ADDRESS = 'localhost:50051';
    process.env.VALKEY_URL = 'redis://localhost:6380';
    delete process.env.TRUSTED_PROXY_HOPS;
  });

  // Se restaura variable por variable: reemplazar process.env entero lo deja como un objeto común.
  afterEach(() => {
    for (const [name, value] of original) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });

  it('acepta hasta 5', () => {
    process.env.TRUSTED_PROXY_HOPS = '5';

    expect(loadEnvConfigs().trustedProxyHops).toBe(5);
  });

  it('vale 0 si la variable no está', () => {
    expect(loadEnvConfigs().trustedProxyHops).toBe(0);
  });

  it('toma el número de la variable', () => {
    process.env.TRUSTED_PROXY_HOPS = '2';

    expect(loadEnvConfigs().trustedProxyHops).toBe(2);
  });

  it.each(['-1', '1.5', 'true', 'abc', '6', '99999999999999999999'])('falla al arrancar con un valor inválido: %s', (value) => {
    process.env.TRUSTED_PROXY_HOPS = value;

    expect(() => loadEnvConfigs()).toThrow('TRUSTED_PROXY_HOPS');
  });
});
