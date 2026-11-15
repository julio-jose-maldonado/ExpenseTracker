import { Writable } from 'node:stream';
import {
  type Client,
  credentials,
  makeGenericClientConstructor,
  Server,
  type ServiceError,
  status,
  type UntypedHandleCall,
} from '@grpc/grpc-js';
import { getGrpcMethod } from '../../src/Context/GetGrpcMethod';
import { getRequestDeadline } from '../../src/Context/GetRequestDeadline';
import { getRequestId } from '../../src/Context/GetRequestId';
import { runWithRequestContext } from '../../src/Context/RunWithRequestContext';
import { AppError } from '../../src/Errors/AppError';
import { ErrorCode } from '../../src/Errors/ErrorCode';
import { callUnary } from '../../src/Grpc/CallUnary';
import { handleUnary } from '../../src/Grpc/HandleUnary';
import { startGrpcServer } from '../../src/Grpc/StartGrpcServer';
import { createLogger } from '../../src/Logs/CreateLogger';

// Servicio gRPC mínimo con mensajes JSON, para probar callUnary y handleUnary de punta a punta
// sin depender de los contratos de Packages/proto.
interface EchoMessage {
  text: string;
}
const toBuffer = (value: EchoMessage) => Buffer.from(JSON.stringify(value));
const fromBuffer = (buffer: Buffer) => JSON.parse(buffer.toString()) as EchoMessage;
const echoService = {
  echo: {
    path: '/test.EchoService/Echo',
    requestStream: false,
    responseStream: false,
    requestSerialize: toBuffer,
    requestDeserialize: fromBuffer,
    responseSerialize: toBuffer,
    responseDeserialize: fromBuffer,
  },
} as const;
const EchoClient = makeGenericClientConstructor(echoService, 'EchoService');
type EchoClient = Client & { echo: Parameters<typeof callUnary<EchoMessage, EchoMessage>>[0] };

const logLines: Array<Record<string, unknown>> = [];
const logger = createLogger(
  'core-test',
  new Writable({
    write: (chunk: Buffer, _encoding, done) => {
      logLines.push(JSON.parse(chunk.toString()) as Record<string, unknown>);
      done();
    },
  }),
);

const servers: Server[] = [];
const clients: Client[] = [];

async function startEchoServer(handler: UntypedHandleCall): Promise<EchoClient> {
  const server = new Server();
  server.addService(echoService, { echo: handler });
  servers.push(server);
  return createEchoClient(`127.0.0.1:${await startGrpcServer(server, 0)}`);
}

function createEchoClient(address: string): EchoClient {
  const client = new EchoClient(address, credentials.createInsecure()) as unknown as EchoClient;
  clients.push(client);
  return client;
}

const callEcho = (client: EchoClient, timeoutMs?: number) =>
  callUnary(client.echo.bind(client), { text: 'hola' }, timeoutMs);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Espera a que el canal esté conectado: así un deadline corto mide al handler y no a la conexión.
const waitForReady = (client: Client) =>
  new Promise<void>((resolve, reject) =>
    client.waitForReady(Date.now() + 2000, (error) => (error ? reject(error) : resolve())),
  );

// Handler que se queda esperando hasta que el test lo libera. Evita depender de sleeps:
// el test sabe cuándo entró y cuándo terminó.
function createHeldHandler() {
  let release!: () => void;
  let markEntered!: () => void;
  let markDone!: () => void;
  const released = new Promise<void>((resolve) => (release = resolve));
  const entered = new Promise<void>((resolve) => (markEntered = resolve));
  const done = new Promise<void>((resolve) => (markDone = resolve));
  const handler = handleUnary(logger, async (request: EchoMessage) => {
    markEntered();
    await released;
    // La línea de cierre se escribe después de que este handler devuelve: se avisa en el turno siguiente.
    setImmediate(markDone);
    return request;
  });
  return { handler, release, entered, done };
}

async function waitFor(condition: () => boolean, timeoutMs = 1000): Promise<void> {
  const limit = Date.now() + timeoutMs;
  while (!condition() && Date.now() < limit) await sleep(10);
}

beforeEach(() => {
  logLines.length = 0;
});

afterEach(() => {
  for (const client of clients.splice(0)) client.close();
  for (const server of servers.splice(0)) server.forceShutdown();
});

describe('callUnary + handleUnary: errores entre capas', () => {
  it('devuelve la respuesta del handler', async () => {
    const client = await startEchoServer(handleUnary(logger, async (request: EchoMessage) => request));

    await expect(callEcho(client)).resolves.toEqual({ text: 'hola' });
  });

  it('reconstruye el AppError con el código que lanzó la capa de abajo', async () => {
    const client = await startEchoServer(
      handleUnary(logger, async () => {
        throw new AppError(ErrorCode.NOT_FOUND, 'expense 42 not found');
      }),
    );

    const error = await callEcho(client).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({ code: ErrorCode.NOT_FOUND });
  });

  it('manda el status gRPC de la categoría y el código en details', async () => {
    const client = await startEchoServer(
      handleUnary(logger, async () => {
        throw new AppError(ErrorCode.NOT_FOUND, 'expense 42 not found');
      }),
    );

    const error = await new Promise<ServiceError | null>((resolve) =>
      (client as unknown as { echo: (request: EchoMessage, callback: (e: ServiceError | null) => void) => void }).echo(
        { text: 'hola' },
        resolve,
      ),
    );

    expect(error).toMatchObject({ code: status.NOT_FOUND, details: 'NOT_FOUND' });
  });

  it('convierte en INTERNAL un error inesperado, sin filtrar su mensaje', async () => {
    const client = await startEchoServer(
      handleUnary(logger, async () => {
        throw new Error('password=secret in query');
      }),
    );

    const error = (await callEcho(client).catch((e: unknown) => e)) as AppError;

    expect(error).toMatchObject({ code: ErrorCode.INTERNAL });
    expect(error.internalMessage).not.toContain('secret');
  });

  it('devuelve SERVICE_UNAVAILABLE si la capa de abajo no responde', async () => {
    const client = createEchoClient('127.0.0.1:1');

    await expect(callEcho(client)).rejects.toMatchObject({ code: ErrorCode.SERVICE_UNAVAILABLE });
  });

  it('devuelve SERVICE_UNAVAILABLE si se vence el deadline', async () => {
    const held = createHeldHandler();
    const client = await startEchoServer(held.handler);
    await waitForReady(client);

    const call = callEcho(client, 150);
    // El handler llegó a correr: el deadline se venció esperándolo, no antes de empezar.
    await held.entered;

    await expect(call).rejects.toMatchObject({ code: ErrorCode.SERVICE_UNAVAILABLE });
    held.release();
    await held.done;
  });

  it('ignora un details que no es un código conocido y decide por el status gRPC', async () => {
    const client = await startEchoServer((_call: unknown, callback: (error: Partial<ServiceError>) => void) =>
      callback({ code: status.PERMISSION_DENIED, details: 'NOT_A_REAL_CODE' }),
    );

    await expect(callEcho(client)).rejects.toMatchObject({ code: ErrorCode.INTERNAL });
  });
});

describe('callUnary + handleUnary: deadline entre capas', () => {
  it('el handler ve el deadline que puso el caller', async () => {
    let remainingMs: number | undefined;
    const client = await startEchoServer(
      handleUnary(logger, async (request: EchoMessage) => {
        remainingMs = (getRequestDeadline() ?? Infinity) - Date.now();
        return request;
      }),
    );

    await callEcho(client, 1000);

    expect(remainingMs).toBeGreaterThan(0);
    expect(remainingMs).toBeLessThanOrEqual(1000);
  });

  it('un segundo salto hereda el tiempo que queda, en vez de sumar 3 s nuevos', async () => {
    let remainingAtSecondHopMs: number | undefined;
    const secondHop = await startEchoServer(
      handleUnary(logger, async (request: EchoMessage) => {
        remainingAtSecondHopMs = (getRequestDeadline() ?? Infinity) - Date.now();
        return request;
      }),
    );
    // El primer salto llama al segundo con el timeout por defecto (3 s).
    const firstHop = await startEchoServer(handleUnary(logger, () => callEcho(secondHop)));

    await callEcho(firstHop, 1000);

    expect(remainingAtSecondHopMs).toBeGreaterThan(0);
    expect(remainingAtSecondHopMs).toBeLessThanOrEqual(1000);
  });
});

describe('handleUnary: logs de cada salto', () => {
  it('el handler conoce el método gRPC y cada línea que escribe lo lleva', async () => {
    let methodInHandler: string | undefined;
    const client = await startEchoServer(
      handleUnary(logger, async (request: EchoMessage) => {
        methodInHandler = getGrpcMethod();
        logger.info('dentro del handler');
        return request;
      }),
    );

    await callEcho(client);

    expect(methodInHandler).toBe('/test.EchoService/Echo');
    expect(logLines[0]).toMatchObject({ message: 'dentro del handler', grpc_method: '/test.EchoService/Echo' });
  });

  it('registra una línea de cierre con el status y la duración cuando responde bien', async () => {
    const client = await startEchoServer(handleUnary(logger, async (request: EchoMessage) => request));

    await callEcho(client);

    expect(logLines).toEqual([
      expect.objectContaining({
        level: 'info',
        message: 'grpc request completed',
        grpc_method: '/test.EchoService/Echo',
        grpc_status: 'OK',
        duration_ms: expect.any(Number),
      }),
    ]);
  });

  it('un error de dominio solo deja la línea de cierre, como info, con su código', async () => {
    const client = await startEchoServer(
      handleUnary(logger, async () => {
        throw new AppError(ErrorCode.NOT_FOUND, 'expense 42 not found');
      }),
    );

    await callEcho(client).catch(() => undefined);

    expect(logLines).toEqual([
      expect.objectContaining({
        level: 'info',
        message: 'grpc request completed',
        grpc_status: 'NOT_FOUND',
        error_code: 'NOT_FOUND',
        duration_ms: expect.any(Number),
      }),
    ]);
  });

  it('una falla del servicio deja una línea de error con el detalle y después la de cierre', async () => {
    const client = await startEchoServer(
      handleUnary(logger, async () => {
        throw new Error('boom');
      }),
    );

    await callEcho(client).catch(() => undefined);

    expect(logLines).toEqual([
      expect.objectContaining({ level: 'error', message: 'grpc handler failed', error_code: 'INTERNAL' }),
      expect.objectContaining({ level: 'info', message: 'grpc request completed', grpc_status: 'INTERNAL' }),
    ]);
  });
});

describe('callUnary + handleUnary: casos límite', () => {
  it.each([ErrorCode.MALFORMED_REQUEST, ErrorCode.PAYLOAD_TOO_LARGE])(
    'un código que describe el request HTTP (%s) no cruza entre capas: llega como INTERNAL',
    async (code) => {
      const client = await startEchoServer(
        handleUnary(logger, async () => {
          throw new AppError(code, 'bad internal request');
        }),
      );

      await expect(callEcho(client)).rejects.toMatchObject({ code: ErrorCode.INTERNAL });
    },
  );

  it('conserva el error gRPC original como cause', async () => {
    const client = await startEchoServer(
      handleUnary(logger, async () => {
        throw new AppError(ErrorCode.NOT_FOUND, 'expense 42 not found');
      }),
    );

    const error = (await callEcho(client).catch((e: unknown) => e)) as AppError;

    expect(error.cause).toMatchObject({ code: status.NOT_FOUND, details: 'NOT_FOUND' });
  });

  it('un handler que lanza de forma sincrónica responde INTERNAL enseguida, sin esperar al deadline', async () => {
    const client = await startEchoServer(
      handleUnary(logger, () => {
        throw new Error('sync boom');
      }),
    );

    await expect(callEcho(client, 500)).rejects.toMatchObject({ code: ErrorCode.INTERNAL });
    expect(logLines).toContainEqual(
      expect.objectContaining({ message: 'grpc request completed', grpc_status: 'INTERNAL' }),
    );
  });

  it('cuando el caller se va antes de la respuesta deja un aviso, y la línea de cierre lo marca', async () => {
    const held = createHeldHandler();
    const client = await startEchoServer(held.handler);
    await waitForReady(client);

    const call = callEcho(client, 150);
    await held.entered;
    await call.catch(() => undefined);
    await waitFor(() => logLines.length > 0);
    held.release();
    await held.done;

    expect(logLines).toEqual([
      expect.objectContaining({
        level: 'warn',
        message: 'grpc caller gave up before the response',
        grpc_method: '/test.EchoService/Echo',
        duration_ms: expect.any(Number),
      }),
      expect.objectContaining({ level: 'info', message: 'grpc request completed', cancelled: true }),
    ]);
  });

  it('un handler que nunca termina igual deja el aviso de que el caller se fue', async () => {
    const client = await startEchoServer(handleUnary(logger, () => new Promise<EchoMessage>(() => undefined)));
    await waitForReady(client);

    await callEcho(client, 150).catch(() => undefined);
    await waitFor(() => logLines.length > 0);

    expect(logLines).toEqual([
      expect.objectContaining({ level: 'warn', message: 'grpc caller gave up before the response' }),
    ]);
  });

  it('rechaza con un AppError también si el cliente gRPC falla antes de enviar la llamada', async () => {
    const client = await startEchoServer(handleUnary(logger, async (request: EchoMessage) => request));
    client.close();

    const error = await callEcho(client).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(AppError);
  });

  it('la línea de cierre dice cancelled: false cuando el caller recibió la respuesta', async () => {
    const client = await startEchoServer(handleUnary(logger, async (request: EchoMessage) => request));

    await callEcho(client);

    expect(logLines).toEqual([expect.objectContaining({ message: 'grpc request completed', cancelled: false })]);
  });

  it('no despacha la llamada si el deadline heredado ya venció', async () => {
    let handlerCalled = false;
    const client = await startEchoServer(
      handleUnary(logger, async (request: EchoMessage) => {
        handlerCalled = true;
        return request;
      }),
    );

    const call = runWithRequestContext({ requestId: 'req-123', deadline: Date.now() - 1 }, () => callEcho(client));

    await expect(call).rejects.toMatchObject({ code: ErrorCode.SERVICE_UNAVAILABLE });
    await sleep(50);
    expect(handlerCalled).toBe(false);
  });

  it('descarta un request id con formato inválido que llega por metadata y genera uno nuevo', async () => {
    let requestIdInHandler: string | undefined;
    const client = await startEchoServer(
      handleUnary(logger, async (request: EchoMessage) => {
        requestIdInHandler = getRequestId();
        return request;
      }),
    );

    await runWithRequestContext({ requestId: 'bad id {"level":"fatal"}' }, () => callEcho(client));

    expect(requestIdInHandler).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it('respeta un request id válido que llega por metadata', async () => {
    let requestIdInHandler: string | undefined;
    const client = await startEchoServer(
      handleUnary(logger, async (request: EchoMessage) => {
        requestIdInHandler = getRequestId();
        return request;
      }),
    );

    await runWithRequestContext({ requestId: 'req-from-gateway' }, () => callEcho(client));

    expect(requestIdInHandler).toBe('req-from-gateway');
  });
});

