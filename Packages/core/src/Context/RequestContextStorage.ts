import { AsyncLocalStorage } from 'node:async_hooks';

export interface RequestContext {
  requestId: string;
  // Momento límite del request (epoch en ms), heredado del caller gRPC. Sin valor: no hay límite heredado.
  deadline?: number;
  // IP de quien llamó al Gateway. No viaja a las otras capas.
  clientIp?: string;
  // Método gRPC que se está atendiendo (Business y DataAccess): `/paquete.Servicio/Metodo`.
  grpcMethod?: string;
}

export const requestContextStorage = new AsyncLocalStorage<RequestContext>();
