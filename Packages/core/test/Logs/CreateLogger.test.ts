import { Writable } from 'node:stream';
import { runWithRequestId } from '../../src/Context/RunWithRequestId';
import { createLogger } from '../../src/Logs/CreateLogger';

function captureLines() {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk, _encoding, done) {
      lines.push(chunk.toString());
      done();
    },
  });
  return { lines, stream };
}

describe('createLogger', () => {
  it('escribe una línea JSON con timestamp, level, service, message y request_id', () => {
    const { lines, stream } = captureLines();
    const logger = createLogger('gateway', stream);

    runWithRequestId('req-abc', () => logger.info('hola'));

    const entry = JSON.parse(lines[0]);
    expect(entry).toMatchObject({
      level: 'info',
      service: 'gateway',
      message: 'hola',
      request_id: 'req-abc',
    });
    expect(new Date(entry.timestamp).toISOString()).toBe(entry.timestamp);
  });

  it('no incluye request_id fuera de un request', () => {
    const { lines, stream } = captureLines();
    createLogger('business', stream).info('arranque');

    expect(JSON.parse(lines[0])).not.toHaveProperty('request_id');
  });
});
