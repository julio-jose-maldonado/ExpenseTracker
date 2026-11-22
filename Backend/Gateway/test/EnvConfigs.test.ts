import { loadEnvConfigs } from '../src/Config/EnvConfigs';

const NAMES = ['PORT', 'BUSINESS_GRPC_ADDRESS', 'TRUSTED_PROXY_HOPS', 'VALKEY_URL', 'RATE_LIMIT_GENERAL_MAX'] as const;
const original = NAMES.map((name) => [name, process.env[name]] as const);

beforeEach(() => {
  process.env.PORT = '3000';
  process.env.BUSINESS_GRPC_ADDRESS = 'localhost:50051';
  process.env.VALKEY_URL = 'redis://localhost:6380';
  delete process.env.TRUSTED_PROXY_HOPS;
  delete process.env.RATE_LIMIT_GENERAL_MAX;
});

// Se restaura variable por variable: reemplazar process.env entero lo deja como un objeto común.
afterEach(() => {
  for (const [name, value] of original) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

describe('Gateway: VALKEY_URL', () => {
  it('toma la URL de la variable', () => {
    expect(loadEnvConfigs().valkeyUrl).toBe('redis://localhost:6380');
  });

  it('acepta una URL con TLS', () => {
    process.env.VALKEY_URL = 'rediss://cache.example.com:6379';

    expect(loadEnvConfigs().valkeyUrl).toBe('rediss://cache.example.com:6379');
  });

  it('falla al arrancar si falta', () => {
    delete process.env.VALKEY_URL;

    expect(() => loadEnvConfigs()).toThrow('VALKEY_URL');
  });

  it.each(['localhost:6380', 'http://localhost:6380', 'no es una url', 'redis://', 'redis:foo', 'rediss://:6379'])('falla al arrancar si no es una URL de Valkey: %s', (value) => {
    process.env.VALKEY_URL = value;

    expect(() => loadEnvConfigs()).toThrow('VALKEY_URL');
  });

  it('el error no muestra la URL, que puede traer una contraseña', () => {
    process.env.VALKEY_URL = 'http://user:hunter2@localhost:6380';

    let message = '';
    try {
      loadEnvConfigs();
    } catch (error) {
      message = String(error);
    }

    expect(message).toContain('VALKEY_URL');
    expect(message).not.toContain('hunter2');
  });
});

describe('Gateway: RATE_LIMIT_GENERAL_MAX', () => {
  it('sin la variable no hay valor: se usa el límite general de la tabla', () => {
    expect(loadEnvConfigs().rateLimitGeneralMax).toBeUndefined();
  });

  it('toma el número de la variable', () => {
    process.env.RATE_LIMIT_GENERAL_MAX = '50';

    expect(loadEnvConfigs().rateLimitGeneralMax).toBe(50);
  });

  it.each(['0', '-1', '1.5', 'abc', '1000001'])('falla al arrancar con un valor inválido: %s', (value) => {
    process.env.RATE_LIMIT_GENERAL_MAX = value;

    expect(() => loadEnvConfigs()).toThrow('RATE_LIMIT_GENERAL_MAX');
  });
});
