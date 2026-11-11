import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { DiagnosticsService } from './diagnostics.service';
import { RecordErrorInput } from './diagnostics.types';

const gid = '64b7f0c2e4b0a1a2b3c4d5f0';

const sampleInput: RecordErrorInput = {
  source: 'server',
  severity: 'error',
  kind: 'http_exception',
  name: 'TypeError',
  message: 'boom for a@b.co',
  stack: 's'.repeat(10000),
  path: '/x?token=t',
  route: 'GET /x',
  user: {
    id: '64b7f0c2e4b0a1a2b3c4d5e6',
    role: 'admin',
    organizationId: '64b7f0c2e4b0a1a2b3c4d5e7',
  },
};

describe('DiagnosticsService', () => {
  let service: DiagnosticsService;
  let groupModel: { findOneAndUpdate: jest.Mock; updateOne: jest.Mock };
  let eventModel: { create: jest.Mock };

  beforeEach(async () => {
    groupModel = {
      findOneAndUpdate: jest.fn().mockResolvedValue({
        _id: gid,
        status: 'open',
        affectedUserIds: [],
        affectedOrgIds: [],
      }),
      updateOne: jest.fn().mockResolvedValue({}),
    };
    eventModel = { create: jest.fn().mockResolvedValue({}) };
    const moduleRef = await Test.createTestingModule({
      providers: [
        DiagnosticsService,
        { provide: getModelToken('ErrorGroup'), useValue: groupModel },
        { provide: getModelToken('ErrorEvent'), useValue: eventModel },
      ],
    }).compile();
    service = moduleRef.get(DiagnosticsService);
  });

  it('upserts the group by fingerprint and inserts a truncated, sanitized event', async () => {
    await service.recordAsync(sampleInput);
    const [filter, update, opts] = groupModel.findOneAndUpdate.mock.calls[0];
    expect(filter).toEqual({
      fingerprint: expect.stringMatching(/^[0-9a-f]{40}$/),
    });
    expect(update.$inc).toEqual({ count: 1 });
    expect(update.$setOnInsert.firstSeen).toBeInstanceOf(Date);
    expect(update.$setOnInsert.status).toBe('open');
    expect(update.$set.message).toBe('boom for <email>');
    expect(update.$addToSet).toEqual({ roles: 'admin' });
    expect(opts).toMatchObject({ upsert: true, new: true });
    const event = eventModel.create.mock.calls[0][0];
    expect(event.message).toBe('boom for <email>');
    expect(event.stack.length).toBe(8192);
    expect(event.path).toBe('/x?token=[redacted]');
  });

  it('adds the user and org to the affected sets when under the cap', async () => {
    await service.recordAsync(sampleInput);
    expect(groupModel.updateOne).toHaveBeenCalledWith(
      { _id: gid },
      { $addToSet: { affectedUserIds: sampleInput.user!.id } },
    );
    expect(groupModel.updateOne).toHaveBeenCalledWith(
      { _id: gid },
      { $addToSet: { affectedOrgIds: sampleInput.user!.organizationId } },
    );
  });

  it('does not grow affected sets past 500 entries', async () => {
    const full = Array.from({ length: 500 }, (_, i) => `id${i}`);
    groupModel.findOneAndUpdate.mockResolvedValue({
      _id: gid,
      status: 'open',
      affectedUserIds: full,
      affectedOrgIds: full,
    });
    await service.recordAsync(sampleInput);
    expect(groupModel.updateOne).not.toHaveBeenCalled();
  });

  it('reopens a resolved group when the error comes back', async () => {
    groupModel.findOneAndUpdate.mockResolvedValue({
      _id: gid,
      status: 'resolved',
    });
    await service.recordAsync(sampleInput);
    expect(groupModel.updateOne).toHaveBeenCalledWith(
      { _id: gid },
      { $set: { status: 'open' }, $unset: { resolvedAt: 1, resolvedBy: 1 } },
    );
  });

  it('never rejects when the database fails', async () => {
    groupModel.findOneAndUpdate.mockRejectedValue(new Error('mongo down'));
    await expect(service.recordAsync(sampleInput)).resolves.toBeUndefined();
  });

  it('drops an invalid userId but keeps the event and the org update', async () => {
    await service.recordAsync({
      ...sampleInput,
      user: { ...sampleInput.user, id: 'not-an-id' },
    });
    expect(eventModel.create).toHaveBeenCalledTimes(1);
    const event = eventModel.create.mock.calls[0][0];
    expect(event.userId).toBeUndefined();
    expect(event.organizationId).toBe(sampleInput.user!.organizationId);
    expect(groupModel.updateOne).toHaveBeenCalledWith(
      { _id: gid },
      { $addToSet: { affectedOrgIds: sampleInput.user!.organizationId } },
    );
    expect(groupModel.updateOne).toHaveBeenCalledTimes(1);
  });

  it('drops an invalid organizationId but keeps the event and user update', async () => {
    await service.recordAsync({
      ...sampleInput,
      user: { ...sampleInput.user, organizationId: 'bad-org' },
    });
    const event = eventModel.create.mock.calls[0][0];
    expect(event.organizationId).toBeUndefined();
    expect(event.userId).toBe(sampleInput.user!.id);
    expect(groupModel.updateOne).toHaveBeenCalledWith(
      { _id: gid },
      { $addToSet: { affectedUserIds: sampleInput.user!.id } },
    );
  });

  it('inserts the event even if group follow-up updates fail', async () => {
    groupModel.updateOne.mockRejectedValue(new Error('boom'));
    await expect(service.recordAsync(sampleInput)).resolves.toBeUndefined();
    expect(eventModel.create).toHaveBeenCalledTimes(1);
    expect(groupModel.updateOne).toHaveBeenCalledTimes(2);
  });

  it('still updates the group when the event insert fails', async () => {
    eventModel.create.mockRejectedValue(new Error('boom'));
    await service.recordAsync(sampleInput);
    expect(groupModel.updateOne).toHaveBeenCalledTimes(2);
  });

  it('defaults an empty message so the event is not dropped', async () => {
    await service.recordAsync({ ...sampleInput, message: '' });
    const [, update] = groupModel.findOneAndUpdate.mock.calls[0];
    expect(update.$set.message).toBe('TypeError');
    expect(eventModel.create.mock.calls[0][0].message).toBe('TypeError');
  });

  it('record() does not throw and triggers recordAsync', async () => {
    service.record(sampleInput);
    await new Promise((r) => setImmediate(r));
    expect(groupModel.findOneAndUpdate).toHaveBeenCalled();
  });
});

describe('DiagnosticsService queries', () => {
  const oid = (n: number) =>
    `64b7f0c2e4b0a1a2b3c4d5${n.toString(16).padStart(2, '0')}`;
  const chain = (result: unknown) => {
    const c: Record<string, jest.Mock> = {};
    for (const m of ['sort', 'skip', 'limit']) c[m] = jest.fn(() => c);
    c.lean = jest.fn().mockResolvedValue(result);
    return c;
  };
  let service: DiagnosticsService;
  let groupModel: {
    find: jest.Mock;
    findById: jest.Mock;
    findByIdAndUpdate: jest.Mock;
    countDocuments: jest.Mock;
    distinct: jest.Mock;
  };
  let eventModel: {
    find: jest.Mock;
    countDocuments: jest.Mock;
    distinct: jest.Mock;
  };

  const rawGroup = () => ({
    _id: { toString: () => gid },
    message: 'm',
    count: 3,
    affectedUserIds: [oid(1), oid(2)],
    affectedOrgIds: [oid(3)],
  });

  beforeEach(() => {
    groupModel = {
      find: jest.fn(),
      findById: jest.fn(),
      findByIdAndUpdate: jest.fn(),
      distinct: jest.fn(),
      countDocuments: jest.fn(),
    };
    eventModel = {
      find: jest.fn(),
      countDocuments: jest.fn(),
      distinct: jest.fn(),
    };
    service = new DiagnosticsService(groupModel as never, eventModel as never);
  });

  describe('getSummary', () => {
    it('counts events in the last 24h and open groups', async () => {
      const now = new Date('2026-11-11T12:00:00Z');
      // Events carry no severity: warnings are events of warning-severity groups.
      groupModel.distinct.mockResolvedValue(['w1', 'w2']);
      eventModel.countDocuments.mockImplementation((f: { groupId?: unknown }) =>
        Promise.resolve(f.groupId ? 2 : 9),
      );
      eventModel.distinct.mockResolvedValue(['a', 'b', 'c']);
      groupModel.countDocuments.mockResolvedValue(4);

      const res = await service.getSummary(now);

      expect(res).toEqual({
        errorsLast24h: 7,
        warningsLast24h: 2,
        openGroups: 4,
        usersAffectedLast24h: 3,
      });
      const since = new Date('2026-11-10T12:00:00Z');
      expect(groupModel.countDocuments).toHaveBeenCalledWith({
        status: 'open',
      });
      expect(eventModel.distinct).toHaveBeenCalledWith('userId', {
        createdAt: { $gte: since },
      });
    });
  });

  describe('listGroups', () => {
    beforeEach(() => {
      groupModel.find.mockReturnValue(chain([rawGroup()]));
      groupModel.countDocuments.mockResolvedValue(1);
    });

    it('defaults to open errors, newest first, page 1 of 25', async () => {
      const res = await service.listGroups({});
      expect(groupModel.find).toHaveBeenCalledWith({
        severity: 'error',
        status: 'open',
      });
      const c = groupModel.find.mock.results[0].value;
      expect(c.sort).toHaveBeenCalledWith({ lastSeen: -1 });
      expect(c.skip).toHaveBeenCalledWith(0);
      expect(c.limit).toHaveBeenCalledWith(25);
      expect(res.page).toBe(1);
      expect(res.limit).toBe(25);
      expect(res.total).toBe(1);
    });

    it('returns views without affected id lists but with counts', async () => {
      const res = await service.listGroups({});
      expect(res.items[0]).toEqual({
        _id: gid,
        message: 'm',
        count: 3,
        usersAffected: 2,
        orgsAffected: 1,
      });
    });

    it('uses an empty filter for severity=all and status=all', async () => {
      await service.listGroups({ severity: 'all', status: 'all' });
      expect(groupModel.find).toHaveBeenCalledWith({});
    });

    it('applies source, paging and escapes the search text', async () => {
      await service.listGroups({
        source: 'client',
        q: 'a.b(',
        page: 3,
        limit: 10,
      });
      const filter = groupModel.find.mock.calls[0][0];
      expect(filter.source).toBe('client');
      expect(filter.$or).toEqual([
        { message: { $regex: 'a\\.b\\(', $options: 'i' } },
        { route: { $regex: 'a\\.b\\(', $options: 'i' } },
      ]);
      const c = groupModel.find.mock.results[0].value;
      expect(c.skip).toHaveBeenCalledWith(20);
      expect(c.limit).toHaveBeenCalledWith(10);
    });

    it('escapes every regex metacharacter', async () => {
      await service.listGroups({ q: '.*+?^${}()|[]\\' });
      const pattern = groupModel.find.mock.calls[0][0].$or[0].message.$regex;
      expect(pattern).toBe('\\.\\*\\+\\?\\^\\$\\{\\}\\(\\)\\|\\[\\]\\\\');
    });
  });

  describe('getGroup', () => {
    it('throws NotFoundException for an invalid id without querying', async () => {
      await expect(service.getGroup('not-an-id')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(groupModel.findById).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the group does not exist', async () => {
      groupModel.findById.mockReturnValue(chain(null));
      await expect(service.getGroup(gid)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('returns the group view and the 50 newest events', async () => {
      groupModel.findById.mockReturnValue(chain(rawGroup()));
      const events = [{ message: 'e' }];
      const ec = chain(events);
      eventModel.find.mockReturnValue(ec);

      const res = await service.getGroup(gid);

      expect(eventModel.find).toHaveBeenCalledWith({ groupId: gid });
      expect(ec.sort).toHaveBeenCalledWith({ createdAt: -1 });
      expect(ec.limit).toHaveBeenCalledWith(50);
      expect(res.events).toBe(events);
      expect(res.group).toMatchObject({
        _id: gid,
        usersAffected: 2,
        orgsAffected: 1,
      });
      expect(res.group).not.toHaveProperty('affectedUserIds');
    });
  });

  describe('setStatus', () => {
    const uid = oid(9);

    it('resolves with resolvedAt and resolvedBy', async () => {
      groupModel.findByIdAndUpdate.mockReturnValue(chain(rawGroup()));
      await service.setStatus(gid, 'resolved', uid);
      const [id, update, opts] = groupModel.findByIdAndUpdate.mock.calls[0];
      expect(id).toBe(gid);
      expect(update.$set.status).toBe('resolved');
      expect(update.$set.resolvedAt).toBeInstanceOf(Date);
      expect(String(update.$set.resolvedBy)).toBe(uid);
      expect(update.$unset).toBeUndefined();
      expect(opts).toEqual({ new: true });
    });

    it('reopens by unsetting resolvedAt and resolvedBy', async () => {
      groupModel.findByIdAndUpdate.mockReturnValue(chain(rawGroup()));
      await service.setStatus(gid, 'open', uid);
      const [, update] = groupModel.findByIdAndUpdate.mock.calls[0];
      expect(update).toEqual({
        $set: { status: 'open' },
        $unset: { resolvedAt: 1, resolvedBy: 1 },
      });
    });

    it('returns the updated view', async () => {
      groupModel.findByIdAndUpdate.mockReturnValue(chain(rawGroup()));
      const res = await service.setStatus(gid, 'open', uid);
      expect(res).toMatchObject({ _id: gid, usersAffected: 2 });
    });

    it('throws NotFoundException for invalid or unknown ids', async () => {
      await expect(
        service.setStatus('nope', 'open', uid),
      ).rejects.toBeInstanceOf(NotFoundException);
      groupModel.findByIdAndUpdate.mockReturnValue(chain(null));
      await expect(service.setStatus(gid, 'open', uid)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
