import { Server } from '@grpc/grpc-js';
import type { Logger } from '@expense-tracker/core';
import { healthV1 } from '@expense-tracker/proto';
import { createHealthController } from './Domains/Health/2.Controller/HealthController';

export function createGrpcServer(logger: Logger): Server {
  const server = new Server();
  server.addService(healthV1.HealthServiceService, createHealthController(logger));
  return server;
}
