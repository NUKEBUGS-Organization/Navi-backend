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
