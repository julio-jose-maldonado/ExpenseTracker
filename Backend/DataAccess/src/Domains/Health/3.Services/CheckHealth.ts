import type { healthV1 } from '@expense-tracker/proto';
import { container } from 'tsyringe';
import { ICheckDatabaseHealth } from '../4.Repositories/CheckDatabaseHealth/ICheckDatabaseHealth';

// Primero el request gRPC (lo pasa handleUnary, acá viene vacío); las dependencias, en el último parámetro:
// en producción salen del contenedor, en un test se pasan a mano.
export async function checkHealth(
  _request: healthV1.CheckRequest,
  {
    databaseHealth = container.resolve<ICheckDatabaseHealth>(ICheckDatabaseHealth),
  }: { databaseHealth?: ICheckDatabaseHealth } = {},
): Promise<healthV1.CheckResponse> {
  return { ok: await databaseHealth.check() };
}
