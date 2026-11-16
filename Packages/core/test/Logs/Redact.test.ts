import { Writable } from 'node:stream';
import { createLogger } from '../../src/Logs/CreateLogger';

function logAndRead(fields: Record<string, unknown>): Record<string, any> {
  const lines: Array<Record<string, any>> = [];
  const logger = createLogger(
    'core-test',
    new Writable({
      write: (chunk: Buffer, _encoding, done) => {
        lines.push(JSON.parse(chunk.toString()) as Record<string, any>);
        done();
      },
    }),
  );
  logger.info(fields, 'hola');
  return lines[0] ?? {};
}

const REDACTED = '[REDACTED]';

describe('createLogger: datos sensibles', () => {
  it('ofusca la contraseña y el email de un body, y deja el resto', () => {
    const line = logAndRead({ body: { email: 'ana@example.com', password: 'S3creta!', amount: 1500, currency: 'ARS' } });

    expect(line.body).toEqual({ email: REDACTED, password: REDACTED, amount: 1500, currency: 'ARS' });
  });

  it.each(['password', 'newPassword', 'currentPassword', 'passwordHash', 'token', 'sessionId', 'email'])(
    'ofusca el campo %s en el primer nivel',
    (field) => {
      expect(logAndRead({ [field]: 'valor-sensible' })[field]).toBe(REDACTED);
    },
  );

  it('ofusca cookies y authorization de los headers', () => {
    const line = logAndRead({
      headers: { cookie: 'session=abc', authorization: 'Bearer abc', 'set-cookie': 'session=abc', accept: 'application/json' },
    });

    expect(line.headers).toEqual({
      cookie: REDACTED,
      authorization: REDACTED,
      'set-cookie': REDACTED,
      accept: 'application/json',
    });
  });

  it('ofusca también dos niveles adentro', () => {
    const line = logAndRead({ request: { body: { password: 'S3creta!', description: 'almuerzo' } } });

    expect(line.request.body).toEqual({ password: REDACTED, description: 'almuerzo' });
  });

  it('no agrega campos que no estaban', () => {
    const line = logAndRead({ amount: 1500 });

    expect(line).not.toHaveProperty('password');
    expect(line.amount).toBe(1500);
  });
});
