import { Logger } from '@nestjs/common';
import { DiagnosticsService } from './diagnostics.service';
import { ErrorKind, RecordErrorInput } from './diagnostics.types';

function toInput(
  kind: ErrorKind,
  reason: unknown,
): Pick<
  RecordErrorInput,
  'source' | 'severity' | 'kind' | 'name' | 'message' | 'stack'
> {
  if (reason instanceof Error) {
    return {
      source: 'server',
      severity: 'error',
      kind,
      name: reason.constructor?.name || 'Error',
      message: reason.message,
      stack: reason.stack,
    };
  }
  return {
    source: 'server',
    severity: 'error',
    kind,
    name: 'NonError',
    message: String(reason),
  };
}

function describe(reason: unknown): string {
  return reason instanceof Error
    ? (reason.stack ?? reason.message)
    : String(reason);
}

export function installProcessHandlers(
  diagnostics: DiagnosticsService,
  proc: Pick<NodeJS.Process, 'on' | 'exit'> = process,
  timeoutMs = 2000,
): void {
  proc.on('unhandledRejection', (reason: unknown) => {
    Logger.error(`Unhandled rejection: ${describe(reason)}`, 'Process');
    diagnostics.record(toInput('unhandled_rejection', reason));
  });

  proc.on('uncaughtException', async (error: unknown) => {
    Logger.error(`Uncaught exception: ${describe(error)}`, 'Process');
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<void>((resolve) => {
      timer = setTimeout(resolve, timeoutMs);
      timer.unref?.();
    });
    try {
      await Promise.race([
        diagnostics.recordAsync(toInput('uncaught_exception', error)),
        timeout,
      ]);
    } finally {
      if (timer) clearTimeout(timer);
      proc.exit(1);
    }
  });
}
