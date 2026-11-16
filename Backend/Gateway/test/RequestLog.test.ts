import { Writable } from 'node:stream';
import { createLogger } from '@expense-tracker/core';
import express, { Router } from 'express';
import request from 'supertest';
import { createRequestLog } from '../src/Middleware/CreateRequestLog';

function createApp() {
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

  const expenses = Router();
  expenses.get('/:id', (req, res) => {
    if (req.params.id === 'boom') throw new Error('boom');
    res.json({ data: { id: req.params.id } });
  });

  const app = express();
  app.use(createRequestLog(logger));
  app.get('/isAlive', (_req, res) => {
    res.json({ data: { ok: true } });
  });
  app.use('/expenses', expenses);
  app.use((_error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(500).json({ error: { code: 'INTERNAL' } });
  });
  return { app, lines };
}

describe('Gateway request log', () => {
  it('registra la ruta de un handler montado en la raíz', async () => {
    const { app, lines } = createApp();

    await request(app).get('/isAlive');

    expect(lines).toEqual([expect.objectContaining({ http_method: 'GET', route: '/isAlive', status_code: 200 })]);
  });

  it('registra el prefijo del router y el patrón de la ruta, no el valor del parámetro', async () => {
    const { app, lines } = createApp();

    await request(app).get('/expenses/42');

    expect(lines).toEqual([expect.objectContaining({ route: '/expenses/:id', status_code: 200 })]);
  });

  it('mantiene el prefijo del router cuando el handler falla', async () => {
    const { app, lines } = createApp();

    await request(app).get('/expenses/boom');

    expect(lines).toEqual([expect.objectContaining({ route: '/expenses/:id', status_code: 500 })]);
  });

  it('registra el path pedido cuando ninguna ruta coincide', async () => {
    const { app, lines } = createApp();

    await request(app).get('/no-existe');

    expect(lines).toEqual([expect.objectContaining({ route: '/no-existe', status_code: 404 })]);
  });

  it('registra el user agent de quien llamó', async () => {
    const { app, lines } = createApp();

    await request(app).get('/isAlive').set('user-agent', 'curl/8.7.1');

    expect(lines).toEqual([expect.objectContaining({ user_agent: 'curl/8.7.1' })]);
  });

  it('recorta un user agent demasiado largo a 200 caracteres', async () => {
    const { app, lines } = createApp();

    await request(app).get('/isAlive').set('user-agent', 'a'.repeat(500));

    expect(lines[0]?.user_agent).toBe('a'.repeat(200));
  });

  it('no agrega user_agent si el request no lo trae', async () => {
    const { app, lines } = createApp();

    await request(app).get('/isAlive').unset('user-agent');

    expect(lines[0]).not.toHaveProperty('user_agent');
  });

  it('recorta a 200 caracteres el path de un request que ninguna ruta atendió', async () => {
    const { app, lines } = createApp();

    await request(app).get(`/${'a'.repeat(500)}`);

    expect(lines[0]?.route).toBe(`/${'a'.repeat(199)}`);
  });
});

