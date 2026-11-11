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

  it('falls back to path without query for route and keeps originalUrl as path', () => {
    filter.catch(
      new BadRequestException('bad'),
      hostFor({ method: 'GET', originalUrl: '/a/b?x=1', url: '/b?x=1' }),
    );
    expect(diagnostics.record).toHaveBeenCalledWith(
      expect.objectContaining({ route: 'GET /a/b', path: '/a/b?x=1' }),
    );
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
