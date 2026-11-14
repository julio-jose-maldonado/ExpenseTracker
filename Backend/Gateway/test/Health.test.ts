import { createSilentLogger, startFakeHealthServer } from '@expense-tracker/testing';
import request from 'supertest';
import { container } from 'tsyringe';
import { App } from '../src/App';
import { disposeContainerList, registerContainerList } from '../src/Domains/RegisterContainerList';

function createApp(businessGrpcAddress: string) {
  disposeContainerList();
  container.reset();
  registerContainerList({ businessGrpcAddress });
  return new App(createSilentLogger('gateway')).server;
}

afterAll(() => disposeContainerList());

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe('Gateway health', () => {
  it('GET /isAlive responde 200 sin depender de las otras capas', async () => {
    const response = await request(createApp('127.0.0.1:1')).get('/isAlive');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: { ok: true } });
  });

  it('GET /isAliveChain responde 200 cuando Business está vivo', async () => {
    const business = await startFakeHealthServer();

    const response = await request(createApp(business.address)).get('/isAliveChain');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: { ok: true } });
    business.stop();
  });

  it('GET /isAliveChain responde 503 con mensaje traducido cuando Business no responde', async () => {
    const response = await request(createApp('127.0.0.1:1')).get('/isAliveChain');

    expect(response.status).toBe(503);
    expect(response.body).toEqual({
      error: {
        code: 'SERVICE_UNAVAILABLE',
        message: 'El servicio no está disponible en este momento. Intentá de nuevo más tarde.',
      },
    });
  });
});

describe('Gateway request id', () => {
  it('reenvía a Business el x-request-id recibido y lo devuelve en la respuesta', async () => {
    const business = await startFakeHealthServer();

    const response = await request(createApp(business.address))
      .get('/isAliveChain')
      .set('x-request-id', 'req-from-client-1');

    expect(response.headers['x-request-id']).toBe('req-from-client-1');
    expect(business.received[0].get('x-request-id')).toEqual(['req-from-client-1']);
    business.stop();
  });

  it('genera un request id nuevo si no viene o tiene un formato inválido', async () => {
    const app = createApp('127.0.0.1:1');

    const withoutHeader = await request(app).get('/isAlive');
    // Sin saltos de línea: Node rechaza CR/LF en headers, así que esa inyección no llega por HTTP.
    const withInvalidChars = await request(app).get('/isAlive').set('x-request-id', 'bad id {"level":"fatal"}');
    const withTooLongId = await request(app).get('/isAlive').set('x-request-id', 'a'.repeat(65));

    expect(withoutHeader.headers['x-request-id']).toMatch(UUID);
    expect(withInvalidChars.headers['x-request-id']).toMatch(UUID);
    expect(withTooLongId.headers['x-request-id']).toMatch(UUID);
  });
});

describe('Gateway requests ilegibles', () => {
  it('responde 400 con mensaje traducido si el JSON está malformado', async () => {
    const response = await request(createApp('127.0.0.1:1'))
      .post('/isAlive')
      .set('content-type', 'application/json')
      .send('{bad');

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: { code: 'MALFORMED_REQUEST', message: 'La solicitud no tiene un formato válido.' },
    });
  });

  it('responde 413 si el body supera el límite', async () => {
    const response = await request(createApp('127.0.0.1:1'))
      .post('/isAlive')
      .send({ text: 'a'.repeat(60_000) });

    expect(response.status).toBe(413);
    expect(response.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });
});

describe('Gateway rutas inexistentes', () => {
  it('responde 404 con mensaje traducido', async () => {
    const response = await request(createApp('127.0.0.1:1')).get('/no-existe');

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      error: { code: 'NOT_FOUND', message: 'El recurso solicitado no existe.' },
    });
  });
});
