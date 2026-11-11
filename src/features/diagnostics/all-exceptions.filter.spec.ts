import {
  ArgumentsHost,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { BaseExceptionFilter, HttpAdapterHost } from '@nestjs/core';
import { AllExceptionsFilter } from './all-exceptions.filter';
import { DiagnosticsService } from './diagnostics.service';

type Req = Record<string, unknown>;

const adminUser = {
  _id: { toString: () => '64b7f0c2e4b0a1a2b3c4d5e6' },
  role: 'admin',
  organizationId: { toString: () => '64b7f0c2e4b0a1a2b3c4d5e7' },
  email: 'a@b.co',
};

function hostFor(request: Req, type = 'http'): ArgumentsHost {
  return {
    getType: () => type,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ArgumentsHost;
}

describe('AllExceptionsFilter', () => {
  let filter: AllExceptionsFilter;
  let diagnostics: { record: jest.Mock };
  let superCatch: jest.SpyInstance;

  beforeEach(() => {
    diagnostics = { record: jest.fn() };
    superCatch = jest
      .spyOn(BaseExceptionFilter.prototype, 'catch')
      .mockImplementation(() => undefined);
    filter = new AllExceptionsFilter(
      { httpAdapter: {} } as unknown as HttpAdapterHost,
      diagnostics as unknown as DiagnosticsService,
    );
  });

  afterEach(() => {
    superCatch.mockRestore();
  });

  it('records 5xx/non-HTTP errors as error and delegates', () => {
    filter.catch(
      new Error('db exploded'),
      hostFor({
        method: 'GET',
        url: '/tasks/1',
        route: { path: '/tasks/:id' },
        user: adminUser,
        headers: { 'user-agent': 'UA' },
        ip: '1.2.3.4',
      }),
    );
    expect(diagnostics.record).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'server',
        severity: 'error',
        kind: 'http_exception',
        statusCode: 500,
        route: 'GET /tasks/:id',
        path: '/tasks/1',
        name: 'Error',
        userAgent: 'UA',
        ip: '1.2.3.4',
        user: expect.objectContaining({
          id: '64b7f0c2e4b0a1a2b3c4d5e6',
          role: 'admin',
          organizationId: '64b7f0c2e4b0a1a2b3c4d5e7',
          email: 'a@b.co',
        }),
      }),
    );
    expect(superCatch).toHaveBeenCalled();
  });

  it('records 4xx as warning', () => {
    filter.catch(
      new NotFoundException('Initiative x not found'),
      hostFor({ method: 'GET', url: '/initiatives/x' }),
    );
    expect(diagnostics.record).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: 'warning',
        statusCode: 404,
        name: 'NotFoundException',
      }),
    );
  });

  it('uses a fixed route when no route pattern matched and keeps originalUrl as path', () => {
    filter.catch(
      new BadRequestException('bad'),
      hostFor({ method: 'GET', originalUrl: '/a/b?x=1', url: '/b?x=1' }),
    );
    expect(diagnostics.record).toHaveBeenCalledWith(
      expect.objectContaining({
        route: 'GET (unmatched)',
        path: '/a/b?x=1',
        message: 'bad',
      }),
    );
  });

  it('records unmatched-route 404s with a fixed message so probes share one group', () => {
    for (const url of ['/wp-login.php', '/.env']) {
      filter.catch(
        new NotFoundException(`Cannot GET ${url}`),
        hostFor({ method: 'GET', originalUrl: url }),
      );
    }
    const [a, b] = diagnostics.record.mock.calls.map((c) => c[0]);
    expect(a).toMatchObject({
      route: 'GET (unmatched)',
      message: 'Cannot GET (unmatched route)',
      path: '/wp-login.php',
      statusCode: 404,
      severity: 'warning',
    });
    expect(b).toMatchObject({
      route: a.route,
      message: a.message,
      path: '/.env',
    });
  });

  it('keeps the message of a 404 thrown from a matched route', () => {
    filter.catch(
      new NotFoundException('Initiative x not found'),
      hostFor({
        method: 'GET',
        url: '/initiatives/x',
        route: { path: '/initiatives/:id' },
      }),
    );
    expect(diagnostics.record).toHaveBeenCalledWith(
      expect.objectContaining({
        route: 'GET /initiatives/:id',
        message: 'Initiative x not found',
      }),
    );
  });

  it('records body-parser JSON failures as 400 warnings without the body', () => {
    const body = '{"password":hunter2}';
    let parseError: Error | undefined;
    try {
      JSON.parse(body);
    } catch (e) {
      parseError = e as Error;
    }
    // Shape produced by body-parser (http-errors) for malformed JSON.
    const err = Object.assign(parseError!, {
      status: 400,
      statusCode: 400,
      expose: true,
      type: 'entity.parse.failed',
      body,
    });
    expect(err.message).toContain('hunter2');
    filter.catch(err, hostFor({ method: 'POST', originalUrl: '/auth/login' }));
    const input = diagnostics.record.mock.calls[0][0];
    expect(input).toMatchObject({
      statusCode: 400,
      severity: 'warning',
      message: 'Malformed JSON body',
      route: 'POST (unmatched)',
    });
    expect(input.stack).toBeUndefined();
    expect(JSON.stringify(input)).not.toContain('hunter2');
  });

  it('treats a SyntaxError with status 400 as a body parse failure', () => {
    const err = Object.assign(new SyntaxError('Unexpected token s'), {
      status: 400,
    });
    filter.catch(err, hostFor({ method: 'POST', url: '/a' }));
    expect(diagnostics.record).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Malformed JSON body',
        stack: undefined,
        statusCode: 400,
      }),
    );
  });

  it('uses numeric status/statusCode of non-Nest errors', () => {
    const tooLarge = Object.assign(new Error('request entity too large'), {
      status: 413,
      type: 'entity.too.large',
    });
    filter.catch(tooLarge, hostFor({ method: 'POST', url: '/a' }));
    const unavailable = Object.assign(new Error('upstream down'), {
      statusCode: 503,
    });
    filter.catch(unavailable, hostFor({ method: 'GET', url: '/b' }));
    const bogus = Object.assign(new Error('weird'), { status: 'nope' });
    filter.catch(bogus, hostFor({ method: 'GET', url: '/c' }));
    const [a, b, c] = diagnostics.record.mock.calls.map((x) => x[0]);
    expect(a).toMatchObject({
      statusCode: 413,
      severity: 'warning',
      message: 'request entity too large',
    });
    expect(b).toMatchObject({ statusCode: 503, severity: 'error' });
    expect(c).toMatchObject({ statusCode: 500, severity: 'error' });
  });

  it('drops the stack of any error carrying a body property', () => {
    const err = Object.assign(new Error('bad encoding'), {
      status: 415,
      body: 'secret',
    });
    filter.catch(err, hostFor({ method: 'POST', url: '/a' }));
    const input = diagnostics.record.mock.calls[0][0];
    expect(input.stack).toBeUndefined();
    expect(input.message).toBe('bad encoding');
  });

  it('handles non-Error thrown values', () => {
    filter.catch('plain string', hostFor({ method: 'GET', url: '/a' }));
    expect(diagnostics.record).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'NonError',
        message: 'plain string',
        statusCode: 500,
      }),
    );
  });

  it('skips /diagnostics routes', () => {
    filter.catch(
      new Error('x'),
      hostFor({ method: 'POST', url: '/diagnostics/client-errors' }),
    );
    expect(diagnostics.record).not.toHaveBeenCalled();
    expect(superCatch).toHaveBeenCalled();
  });

  it('only delegates for non-http contexts', () => {
    filter.catch(new Error('x'), hostFor({}, 'rpc'));
    expect(diagnostics.record).not.toHaveBeenCalled();
    expect(superCatch).toHaveBeenCalled();
  });

  it('still delegates when recording throws', () => {
    diagnostics.record.mockImplementation(() => {
      throw new Error('boom');
    });
    expect(() =>
      filter.catch(new Error('x'), hostFor({ method: 'GET', url: '/a' })),
    ).not.toThrow();
    expect(superCatch).toHaveBeenCalled();
  });
});
