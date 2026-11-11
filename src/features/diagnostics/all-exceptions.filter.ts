import {
  ArgumentsHost,
  Catch,
  HttpException,
  NotFoundException,
} from '@nestjs/common';
import { BaseExceptionFilter, HttpAdapterHost } from '@nestjs/core';
import { DiagnosticsService } from './diagnostics.service';
import { RecordErrorInput } from './diagnostics.types';

interface RequestLike {
  method?: string;
  url?: string;
  originalUrl?: string;
  route?: { path?: string };
  ip?: string;
  headers?: Record<string, string | string[] | undefined>;
  user?: {
    _id?: unknown;
    id?: unknown;
    role?: unknown;
    organizationId?: unknown;
    email?: unknown;
  };
}

const str = (value: unknown): string | undefined =>
  value === undefined || value === null || value === ''
    ? undefined
    : String(value);

/** HTTP status for the exception, including non-Nest errors carrying one (e.g. body-parser). */
function statusOf(exception: unknown): number {
  if (exception instanceof HttpException) return exception.getStatus();
  if (typeof exception === 'object' && exception !== null) {
    const e = exception as { status?: unknown; statusCode?: unknown };
    const status = e.status ?? e.statusCode;
    if (typeof status === 'number' && status >= 400 && status <= 599) {
      return status;
    }
  }
  return 500;
}

const hasBody = (exception: unknown): boolean =>
  typeof exception === 'object' && exception !== null && 'body' in exception;

/** body-parser JSON failure; V8's message quotes the raw request body. */
function isBodyParseError(exception: unknown): boolean {
  if (typeof exception !== 'object' || exception === null) return false;
  const e = exception as { type?: unknown; status?: unknown };
  return (
    e.type === 'entity.parse.failed' ||
    (exception instanceof SyntaxError && (e.status === 400 || hasBody(e)))
  );
}

@Catch()
export class AllExceptionsFilter extends BaseExceptionFilter {
  constructor(
    adapterHost: HttpAdapterHost,
    private readonly diagnostics: DiagnosticsService,
  ) {
    super(adapterHost.httpAdapter);
  }

  catch(exception: unknown, host: ArgumentsHost): void {
    if (host.getType() === 'http') {
      try {
        this.report(exception, host);
      } catch {
        // Diagnostics must never affect the response.
      }
    }
    super.catch(exception, host);
  }

  private report(exception: unknown, host: ArgumentsHost): void {
    const request = host.switchToHttp().getRequest<RequestLike>();
    const path = request.originalUrl ?? request.url ?? '';
    const pathOnly = path.split('?')[0];
    if (pathOnly.startsWith('/diagnostics')) return;

    const method = request.method ?? '';
    const routePattern = request.route?.path;
    const statusCode = statusOf(exception);
    const isError = exception instanceof Error;
    const bodyParseError = isBodyParseError(exception);

    let message = isError ? exception.message : String(exception);
    if (bodyParseError) {
      message = 'Malformed JSON body';
    } else if (!routePattern && exception instanceof NotFoundException) {
      // Nest's "Cannot GET /raw/path": a fixed message keeps scanner probes in one group.
      message = `Cannot ${method} (unmatched route)`;
    }
    // Errors carrying the request body (body-parser) must not leak it via the stack.
    const keepStack = isError && !bodyParseError && !hasBody(exception);
    const userAgent = request.headers?.['user-agent'];
    const user = request.user;

    const input: RecordErrorInput = {
      source: 'server',
      severity: statusCode >= 500 ? 'error' : 'warning',
      kind: 'http_exception',
      name: isError ? exception.constructor?.name || 'Error' : 'NonError',
      message,
      stack: keepStack ? exception.stack : undefined,
      statusCode,
      method,
      path,
      route: routePattern
        ? `${method} ${routePattern}`
        : `${method} (unmatched)`,
      user: user
        ? {
            id: str(user._id ?? user.id),
            role: str(user.role),
            organizationId: str(user.organizationId),
            email: str(user.email),
          }
        : undefined,
      userAgent: Array.isArray(userAgent) ? userAgent[0] : userAgent,
      ip: request.ip,
    };
    this.diagnostics.record(input);
  }
}
