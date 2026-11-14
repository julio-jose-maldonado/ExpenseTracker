import { type Metadata, Server, status } from '@grpc/grpc-js';
import { startGrpcServer } from '@expense-tracker/core';
import { healthV1 } from '@expense-tracker/proto';

// Servidor gRPC falso de la capa de abajo (para tests): responde ok y guarda la metadata recibida.
export async function startFakeHealthServer(options: { fail?: boolean } = {}) {
  const received: Metadata[] = [];
  const server = new Server();
  server.addService(healthV1.HealthServiceService, {
    check: (call, callback) => {
      received.push(call.metadata);
      if (options.fail) return callback({ code: status.INTERNAL });
      callback(null, { ok: true });
    },
  } satisfies healthV1.HealthServiceServer);
  const port = await startGrpcServer(server, 0);
  return { address: `127.0.0.1:${port}`, received, stop: () => server.forceShutdown() };
}
