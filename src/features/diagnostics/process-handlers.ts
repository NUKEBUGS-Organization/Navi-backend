import { Logger } from '@nestjs/common';
import { DiagnosticsService } from './diagnostics.service';
import { ErrorKind, RecordErrorInput } from './diagnostics.types';

const UNPRINTABLE = '[unprintable]';

function safe<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

function toInput(kind: ErrorKind, reason: unknown): RecordErrorInput {
  if (reason instanceof Error) {
    return {
      source: 'server',
      severity: 'error',
      kind,
      name: safe(() => reason.constructor?.name, '') || 'Error',
      message: safe(() => String(reason.message), UNPRINTABLE),
      stack: safe(() => reason.stack, undefined),
    };
  }
  return {
    source: 'server',
    severity: 'error',
    kind,
    name: 'NonError',
    message: safe(() => String(reason), UNPRINTABLE),
  };
}

function describeReason(reason: unknown): string {
  return safe(
    () =>
      reason instanceof Error
        ? (reason.stack ?? reason.message)
        : String(reason),
    UNPRINTABLE,
  );
}

export function installProcessHandlers(
  diagnostics: DiagnosticsService,
  proc: Pick<NodeJS.Process, 'on' | 'exit'> = process,
  timeoutMs = 2000,
): void {
  // NOTE: registering this listener changes Node's default behavior. Since
  // Node 15 an unhandled rejection crashes the process; with a listener it is
  // recorded and logged but the server keeps running.
  proc.on('unhandledRejection', (reason: unknown) => {
    try {
      Logger.error(`Unhandled rejection: ${describeReason(reason)}`, 'Process');
      diagnostics.record(toInput('unhandled_rejection', reason));
    } catch {
      // never let diagnostics throw out of a process-level listener
    }
  });

  proc.on('uncaughtException', async (error: unknown) => {
    let timer: NodeJS.Timeout | undefined;
    try {
      Logger.error(`Uncaught exception: ${describeReason(error)}`, 'Process');
      const timeout = new Promise<void>((resolve) => {
        timer = setTimeout(resolve, timeoutMs);
        timer.unref?.();
      });
      await Promise.race([
        diagnostics.recordAsync(toInput('uncaught_exception', error)),
        timeout,
      ]);
    } catch {
      // fall through to exit
    } finally {
      if (timer) clearTimeout(timer);
      proc.exit(1);
    }
  });
}
