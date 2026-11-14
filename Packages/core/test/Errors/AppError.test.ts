import { AppError } from '../../src/Errors/AppError';
import { ErrorCode } from '../../src/Errors/ErrorCode';

describe('AppError', () => {
  it('lleva un código estable y un mensaje interno solo para logs', () => {
    const error = new AppError(ErrorCode.INTERNAL, 'db timeout');

    expect(error).toBeInstanceOf(Error);
    expect(error.code).toBe('INTERNAL');
    expect(error.internalMessage).toBe('db timeout');
  });
});
