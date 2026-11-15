import { ErrorCode } from '@expense-tracker/core';
import { checkChainHealth } from '../src/Domains/Health/3.Services/CheckChainHealth';

// Test unitario del service: la dependencia se pasa a mano, sin contenedor ni servidor gRPC.
describe('checkChainHealth', () => {
  it('no falla cuando Business responde ok', async () => {
    await expect(checkChainHealth({ businessHealth: { check: async () => true } })).resolves.toBeUndefined();
  });

  it('falla con SERVICE_UNAVAILABLE cuando Business responde que no está ok', async () => {
    await expect(checkChainHealth({ businessHealth: { check: async () => false } })).rejects.toMatchObject({
      name: 'AppError',
      code: ErrorCode.SERVICE_UNAVAILABLE,
    });
  });
});
