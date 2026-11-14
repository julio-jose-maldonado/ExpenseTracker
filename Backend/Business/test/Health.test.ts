import { credentials, Metadata, type ServiceError, status, type Server } from '@grpc/grpc-js';
import { startGrpcServer } from '@expense-tracker/core';
import { createSilentLogger, startFakeHealthServer } from '@expense-tracker/testing';
import { healthV1 } from '@expense-tracker/proto';
import { container } from 'tsyringe';
import { createGrpcServer } from '../src/CreateGrpcServer';
import { disposeContainerList, registerContainerList } from '../src/Domains/RegisterContainerList';

const silentLogger = createSilentLogger('business');

async function startBusiness(dataAccessGrpcAddress: string) {
  disposeContainerList();
  container.reset();
  registerContainerList({ dataAccessGrpcAddress });
  const server: Server = createGrpcServer(silentLogger);
  const port = await startGrpcServer(server, 0);
  const client = new healthV1.HealthServiceClient(`127.0.0.1:${port}`, credentials.createInsecure());
  const check = (metadata = new Metadata()) =>
    new Promise<healthV1.CheckResponse>((resolve, reject) =>
      client.check({}, metadata, (error, res) => (error ? reject(error) : resolve(res))),
    );
  return { check, stop: () => (client.close(), disposeContainerList(), server.forceShutdown()) };
}

describe('Business HealthService', () => {
  it('responde ok cuando DataAccess está vivo', async () => {
    const dataAccess = await startFakeHealthServer();
    const business = await startBusiness(dataAccess.address);

    await expect(business.check()).resolves.toEqual({ ok: true });

    business.stop();
    dataAccess.stop();
  });

  it('reenvía a DataAccess el x-request-id que recibe', async () => {
    const dataAccess = await startFakeHealthServer();
    const business = await startBusiness(dataAccess.address);
    const metadata = new Metadata();
    metadata.set('x-request-id', 'req-from-gateway');

    await business.check(metadata);

    expect(dataAccess.received[0].get('x-request-id')).toEqual(['req-from-gateway']);
    business.stop();
    dataAccess.stop();
  });

  it('responde UNAVAILABLE cuando DataAccess no responde', async () => {
    const business = await startBusiness('127.0.0.1:1');

    const error = (await business.check().catch((e: unknown) => e)) as ServiceError;

    expect(error.code).toBe(status.UNAVAILABLE);
    expect(error.details).toBe('SERVICE_UNAVAILABLE');
    business.stop();
  });
});
