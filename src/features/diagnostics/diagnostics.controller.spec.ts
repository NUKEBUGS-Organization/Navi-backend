import { PayloadTooLargeException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { DiagnosticsController } from './diagnostics.controller';
import { ClientReportRateLimiter } from './rate-limiter';
import { ClientErrorBatchDto } from './dto/client-error.dto';
import { ListGroupsQueryDto } from './dto/list-groups.dto';
import { UpdateGroupDto } from './dto/update-group.dto';
import { ROLES_KEY, RolesGuard } from '../auth/guards/roles.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UserRole } from '../auth/user.entity';

const validReport = {
  kind: 'render',
  name: 'TypeError',
  message: 'boom',
  pageUrl: 'https://app.example.com/x',
};

const batch = (n: number, extra: Record<string, unknown> = {}) =>
  plainToInstance(ClientErrorBatchDto, {
    reports: Array.from({ length: n }, () => ({ ...validReport, ...extra })),
  });

const reqWith = (headers: Record<string, string>, ip = '9.9.9.9') =>
  ({ headers, ip }) as never;

describe('DiagnosticsController', () => {
  const uid = 'u1';
  const oid = 'o1';
  let controller: DiagnosticsController;
  let diagnostics: { record: jest.Mock };
  let auth: { findOne: jest.Mock };
  let jwt: { verify: jest.Mock };

  beforeEach(() => {
    diagnostics = { record: jest.fn() };
    auth = { findOne: jest.fn() };
    jwt = { verify: jest.fn() };
    controller = new DiagnosticsController(
      diagnostics as never,
      auth as never,
      jwt as never,
      new ClientReportRateLimiter(60),
    );
  });

  it('records client reports as source client / severity error with user from a valid token', async () => {
    jwt.verify.mockReturnValue({ sub: uid });
    auth.findOne.mockResolvedValue({
      _id: uid,
      role: 'employee',
      organizationId: oid,
      email: 'e@x.co',
    });
    const res = await controller.clientErrors(
      batch(2),
      reqWith({ authorization: 'Bearer good' }),
    );
    expect(res).toEqual({ accepted: 2 });
    expect(diagnostics.record).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'client',
        severity: 'error',
        kind: 'render',
        user: expect.objectContaining({ role: 'employee' }),
      }),
    );
  });

  it('accepts reports with an expired/invalid token or none, without user', async () => {
    jwt.verify.mockImplementation(() => {
      throw new Error('jwt expired');
    });
    await expect(
      controller.clientErrors(
        batch(1),
        reqWith({ authorization: 'Bearer bad' }),
      ),
    ).resolves.toEqual({ accepted: 1 });
    expect(diagnostics.record.mock.calls[0][0].user).toBeUndefined();
  });

  it('skips inactive users', async () => {
    jwt.verify.mockReturnValue({ sub: uid });
    auth.findOne.mockResolvedValue({ _id: uid, isActive: false });
    await controller.clientErrors(
      batch(1),
      reqWith({ authorization: 'Bearer good' }),
    );
    expect(diagnostics.record.mock.calls[0][0].user).toBeUndefined();
  });

  it('uses first x-forwarded-for entry as ip and request user-agent', async () => {
    await controller.clientErrors(
      batch(1),
      reqWith({
        'x-forwarded-for': ' 5.5.5.5 , 6.6.6.6',
        'user-agent': 'UA/1',
      }),
    );
    expect(diagnostics.record).toHaveBeenCalledWith(
      expect.objectContaining({ ip: '5.5.5.5', userAgent: 'UA/1' }),
    );
    expect(jwt.verify).not.toHaveBeenCalled();
  });

  it('drops reports over the rate limit but still answers', async () => {
    for (let i = 0; i < 3; i++)
      await controller.clientErrors(batch(20), reqWith({}));
    const res = await controller.clientErrors(batch(20), reqWith({}));
    expect(res.accepted).toBe(0);
    expect(diagnostics.record).toHaveBeenCalledTimes(60);
  });

  it('rejects bodies over 32 KB with 413', async () => {
    await expect(
      controller.clientErrors(
        batch(1, { stack: 'x'.repeat(40_000) }),
        reqWith({}),
      ),
    ).rejects.toBeInstanceOf(PayloadTooLargeException);
  });

  it('validation: 21 reports, unknown kind or empty name fail DTO validation', async () => {
    expect(
      await validate(
        plainToInstance(ClientErrorBatchDto, {
          reports: Array(21).fill(validReport),
        }),
      ),
    ).not.toHaveLength(0);
    expect(
      await validate(
        plainToInstance(ClientErrorBatchDto, {
          reports: [{ ...validReport, kind: 'nope' }],
        }),
      ),
    ).not.toHaveLength(0);
    expect(
      await validate(
        plainToInstance(ClientErrorBatchDto, {
          reports: [{ ...validReport, name: '' }],
        }),
      ),
    ).not.toHaveLength(0);
    expect(
      await validate(
        plainToInstance(ClientErrorBatchDto, { reports: [validReport] }),
      ),
    ).toHaveLength(0);
  });

  describe('admin endpoints', () => {
    const admin = [
      'getSummary',
      'listGroups',
      'getGroup',
      'updateGroup',
    ] as const;
    const proto = DiagnosticsController.prototype as unknown as Record<
      string,
      object
    >;

    it.each(admin)(
      '%s requires super admin with JWT + roles guards',
      (name) => {
        expect(Reflect.getMetadata(ROLES_KEY, proto[name])).toEqual([
          UserRole.SUPER_ADMIN,
        ]);
        expect(Reflect.getMetadata('__guards__', proto[name])).toEqual([
          JwtAuthGuard,
          RolesGuard,
        ]);
      },
    );

    it('clientErrors stays public', () => {
      expect(
        Reflect.getMetadata(ROLES_KEY, proto.clientErrors),
      ).toBeUndefined();
      expect(
        Reflect.getMetadata('__guards__', proto.clientErrors),
      ).toBeUndefined();
      expect(
        Reflect.getMetadata('__guards__', DiagnosticsController),
      ).toBeUndefined();
    });

    it('delegates to the service; updateGroup uses the current user id', async () => {
      const svc = {
        getSummary: jest.fn().mockResolvedValue('s'),
        listGroups: jest.fn().mockResolvedValue('l'),
        getGroup: jest.fn().mockResolvedValue('g'),
        setStatus: jest.fn().mockResolvedValue('u'),
      };
      const c = new DiagnosticsController(
        svc as never,
        auth as never,
        jwt as never,
        new ClientReportRateLimiter(60),
      );
      expect(await c.getSummary()).toBe('s');
      const q = new ListGroupsQueryDto();
      expect(await c.listGroups(q)).toBe('l');
      expect(svc.listGroups).toHaveBeenCalledWith(q);
      expect(await c.getGroup('id1')).toBe('g');
      const res = await c.updateGroup('id1', { status: 'resolved' }, {
        _id: { toString: () => 'user1' },
      } as never);
      expect(res).toBe('u');
      expect(svc.setStatus).toHaveBeenCalledWith('id1', 'resolved', 'user1');
    });

    it('validates the list query and update body', async () => {
      const q = (o: object) => validate(plainToInstance(ListGroupsQueryDto, o));
      expect(await q({})).toHaveLength(0);
      expect(
        await q({ page: '2', limit: '100', severity: 'all' }),
      ).toHaveLength(0);
      expect(plainToInstance(ListGroupsQueryDto, { page: '2' }).page).toBe(2);
      expect(await q({ limit: '101' })).not.toHaveLength(0);
      expect(await q({ page: '0' })).not.toHaveLength(0);
      expect(await q({ severity: 'x' })).not.toHaveLength(0);
      expect(await q({ q: 'a'.repeat(201) })).not.toHaveLength(0);
      const u = (o: object) => validate(plainToInstance(UpdateGroupDto, o));
      expect(await u({ status: 'resolved' })).toHaveLength(0);
      expect(await u({ status: 'all' })).not.toHaveLength(0);
      expect(await u({})).not.toHaveLength(0);
    });
  });
});
