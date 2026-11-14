import { type Server, ServerCredentials } from '@grpc/grpc-js';

// Tráfico interno entre capas (red privada): sin TLS por ahora.
// Devuelve el puerto real (útil con port 0 en tests).
export function startGrpcServer(server: Server, port: number): Promise<number> {
  return new Promise((resolve, reject) => {
    server.bindAsync(`0.0.0.0:${port}`, ServerCredentials.createInsecure(), (error, boundPort) =>
      error ? reject(error) : resolve(boundPort),
    );
  });
}
