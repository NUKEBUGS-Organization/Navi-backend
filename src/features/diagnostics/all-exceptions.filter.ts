import { ArgumentsHost, Catch, HttpException } from '@nestjs/common';
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
    const statusCode =
      exception instanceof HttpException ? exception.getStatus() : 500;
    const isError = exception instanceof Error;
    const userAgent = request.headers?.['user-agent'];
    const user = request.user;

    const input: RecordErrorInput = {
      source: 'server',
      severity: statusCode >= 500 ? 'error' : 'warning',
      kind: 'http_exception',
      name: isError ? exception.constructor?.name || 'Error' : 'NonError',
      message: isError ? exception.message : String(exception),
      stack: isError ? exception.stack : undefined,
      statusCode,
      method,
      path,
      route: request.route?.path
        ? `${method} ${request.route.path}`
        : `${method} ${pathOnly}`,
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
