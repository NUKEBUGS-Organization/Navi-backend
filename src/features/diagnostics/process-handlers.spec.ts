import { Logger } from '@nestjs/common';
import { DiagnosticsService } from './diagnostics.service';
import { installProcessHandlers } from './process-handlers';

describe('installProcessHandlers', () => {
  let handlers: Record<string, (...args: unknown[]) => unknown>;
  let proc: { on: jest.Mock; exit: jest.Mock };
  let diagnostics: { record: jest.Mock; recordAsync: jest.Mock };

  beforeEach(() => {
    jest.spyOn(Logger, 'error').mockImplementation(() => undefined);
    handlers = {};
    proc = {
      on: jest.fn((event: string, fn: (...args: unknown[]) => unknown) => {
        handlers[event] = fn;
        return proc;
      }),
      exit: jest.fn(),
    };
    diagnostics = {
      record: jest.fn(),
      recordAsync: jest.fn().mockResolvedValue(undefined),
    };
    installProcessHandlers(
      diagnostics as unknown as DiagnosticsService,
      proc as unknown as Pick<NodeJS.Process, 'on' | 'exit'>,
    );
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('records unhandled rejections without exiting', () => {
    handlers.unhandledRejection(new Error('async boom'));
    expect(diagnostics.record).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'unhandled_rejection',
        severity: 'error',
        source: 'server',
        name: 'Error',
        message: 'async boom',
      }),
    );
    expect(proc.exit).not.toHaveBeenCalled();
  });

  it('records uncaught exceptions then exits with 1', async () => {
    await handlers.uncaughtException(new Error('fatal'));
    expect(diagnostics.recordAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'uncaught_exception',
        severity: 'error',
        source: 'server',
        message: 'fatal',
      }),
    );
    expect(proc.exit).toHaveBeenCalledWith(1);
  });

  it('exits after the timeout even if recording hangs', async () => {
    jest.useFakeTimers();
    diagnostics.recordAsync.mockReturnValue(new Promise(() => {}));
    const p = handlers.uncaughtException(new Error('fatal'));
    jest.advanceTimersByTime(2000);
    await p;
    expect(proc.exit).toHaveBeenCalledWith(1);
  });

  it('handles non-Error rejection reasons', () => {
    handlers.unhandledRejection('just a string');
    expect(diagnostics.record).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'NonError', message: 'just a string' }),
    );
  });

  const hostile = () => {
    const e = new Error('x');
    Object.defineProperty(e, 'message', {
      get() {
        throw new Error('getter boom');
      },
    });
    Object.defineProperty(e, 'stack', {
      get() {
        throw new Error('stack boom');
      },
    });
    return e;
  };
  const hostileValue = {
    toString() {
      throw new Error('toString boom');
    },
  };

  it('still exits with 1 when the reason cannot be printed', async () => {
    await handlers.uncaughtException(hostile());
    await handlers.uncaughtException(hostileValue);
    expect(proc.exit).toHaveBeenCalledTimes(2);
    expect(proc.exit).toHaveBeenCalledWith(1);
  });

  it('rejection handler never throws', () => {
    expect(() => handlers.unhandledRejection(hostile())).not.toThrow();
    expect(() => handlers.unhandledRejection(hostileValue)).not.toThrow();
    diagnostics.record.mockImplementation(() => {
      throw new Error('record boom');
    });
    expect(() => handlers.unhandledRejection(new Error('a'))).not.toThrow();
  });
});
