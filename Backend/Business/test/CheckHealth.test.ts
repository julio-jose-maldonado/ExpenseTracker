import 'reflect-metadata';
import { checkHealth } from '../src/Domains/Health/3.Services/CheckHealth';

// Test unitario del service: la dependencia se pasa a mano, sin contenedor ni servidor gRPC.
describe('checkHealth', () => {
  it('devuelve ok: true cuando la dependencia responde ok', async () => {
    await expect(checkHealth({}, { dataAccessHealth: { check: async () => true } })).resolves.toEqual({ ok: true });
  });

  it('devuelve ok: false cuando la dependencia responde que no está ok', async () => {
    await expect(checkHealth({}, { dataAccessHealth: { check: async () => false } })).resolves.toEqual({ ok: false });
  });
});
