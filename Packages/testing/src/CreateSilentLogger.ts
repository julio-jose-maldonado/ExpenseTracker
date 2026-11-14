import { Writable } from 'node:stream';
import { createLogger, type Logger } from '@expense-tracker/core';

export function createSilentLogger(service: string): Logger {
  return createLogger(service, new Writable({ write: (_chunk, _encoding, done) => done() }));
}
