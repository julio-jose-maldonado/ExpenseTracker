import type { healthV1 } from '@expense-tracker/proto';
import { container } from 'tsyringe';
import { ICheckDataAccessHealth } from '../4.Repositories/CheckDataAccessHealth/ICheckDataAccessHealth';

// Primero el request gRPC (lo pasa handleUnary, acá viene vacío); las dependencias, en el último parámetro:
// en producción salen del contenedor, en un test se pasan a mano.
export async function checkHealth(
  _request: healthV1.CheckRequest,
  {
    dataAccessHealth = container.resolve<ICheckDataAccessHealth>(ICheckDataAccessHealth),
  }: { dataAccessHealth?: ICheckDataAccessHealth } = {},
): Promise<healthV1.CheckResponse> {
  return { ok: await dataAccessHealth.check() };
}
