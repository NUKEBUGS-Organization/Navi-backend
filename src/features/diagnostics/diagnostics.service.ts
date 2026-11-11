import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ErrorGroupView, LIMITS, RecordErrorInput } from './diagnostics.types';
import { ListGroupsQueryDto } from './dto/list-groups.dto';
import { computeFingerprint, normalizeMessage } from './fingerprint';
import { maskEmails, redactUrl, truncate } from './sanitize';
import { ErrorGroup } from './error-group.entity';
import { ErrorEvent } from './error-event.entity';

const AFFECTED_CAP = 500;

function validId(id?: string): string | undefined {
  return id && /^[0-9a-f]{24}$/i.test(id) ? id : undefined;
}

@Injectable()
export class DiagnosticsService {
  private readonly logger = new Logger(DiagnosticsService.name);

  constructor(
    @InjectModel('ErrorGroup') private readonly groupModel: Model<ErrorGroup>,
    @InjectModel('ErrorEvent') private readonly eventModel: Model<ErrorEvent>,
  ) {}

  /** Fire-and-forget: never throws, never blocks the caller. */
  record(input: RecordErrorInput): void {
    void this.recordAsync(input);
  }

  /** Records an error occurrence. Never rejects. */
  async recordAsync(input: RecordErrorInput): Promise<void> {
    try {
      const now = new Date();
      // An empty message would fail the required validator and lose the event.
      const name = input.name?.trim() ? input.name : 'Error';
      const rawMessage = input.message?.trim() ? input.message : name;
      const fingerprint = computeFingerprint({
        ...input,
        name,
        message: rawMessage,
      });
      const userId = validId(input.user?.id);
      const orgId = validId(input.user?.organizationId);

      const set: Record<string, unknown> = {
        lastSeen: now,
        severity: input.severity,
        message: truncate(normalizeMessage(rawMessage), LIMITS.message),
      };
      if (input.statusCode !== undefined) set.statusCode = input.statusCode;
      if (input.route) set.route = input.route;

      const update: Record<string, unknown> = {
        $inc: { count: 1 },
        $set: set,
        $setOnInsert: {
          firstSeen: now,
          source: input.source,
          kind: input.kind,
          name,
          status: 'open',
        },
      };
      if (input.user?.role) update.$addToSet = { roles: input.user.role };

      const group = await this.groupModel.findOneAndUpdate(
        { fingerprint },
        update,
        { upsert: true, new: true },
      );

      // The event insert must not depend on the follow-up group updates.
      await this.safely('event insert', () =>
        this.eventModel.create({
          groupId: group?._id,
          name,
          message: truncate(maskEmails(rawMessage), LIMITS.message),
          stack: input.stack
            ? truncate(maskEmails(input.stack), LIMITS.stack)
            : undefined,
          componentStack: input.componentStack
            ? truncate(maskEmails(input.componentStack), LIMITS.componentStack)
            : undefined,
          statusCode: input.statusCode,
          method: input.method,
          path: input.path ? redactUrl(input.path) : undefined,
          pageUrl: input.pageUrl ? redactUrl(input.pageUrl) : undefined,
          userId,
          userRole: input.user?.role,
          organizationId: orgId,
          userEmail: input.user?.email,
          userAgent: input.userAgent,
          ip: input.ip,
          appVersion: input.appVersion,
        }),
      );

      if (!group) return;
      if (group.status === 'resolved') {
        await this.safely('reopen group', () =>
          this.groupModel.updateOne(
            { _id: group._id },
            {
              $set: { status: 'open' },
              $unset: { resolvedAt: 1, resolvedBy: 1 },
            },
          ),
        );
      }
      if (userId && (group.affectedUserIds?.length ?? 0) < AFFECTED_CAP) {
        await this.safely('affected users', () =>
          this.groupModel.updateOne(
            { _id: group._id },
            { $addToSet: { affectedUserIds: userId } },
          ),
        );
      }
      if (orgId && (group.affectedOrgIds?.length ?? 0) < AFFECTED_CAP) {
        await this.safely('affected orgs', () =>
          this.groupModel.updateOne(
            { _id: group._id },
            { $addToSet: { affectedOrgIds: orgId } },
          ),
        );
      }
    } catch (err) {
      this.warn('record', err);
    }
  }

  async getSummary(now = new Date()): Promise<{
    errorsLast24h: number;
    warningsLast24h: number;
    openGroups: number;
    usersAffectedLast24h: number;
  }> {
    const since = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const window = { createdAt: { $gte: since } };
    // Events carry no severity; warnings are events of warning-severity groups
    // (any such group with an event in the window has lastSeen >= since).
    const warningGroupIds = await this.groupModel.distinct('_id', {
      severity: 'warning',
      lastSeen: { $gte: since },
    });
    const [total, warningsLast24h, openGroups, users] = await Promise.all([
      this.eventModel.countDocuments(window),
      this.eventModel.countDocuments({
        ...window,
        groupId: { $in: warningGroupIds },
      }),
      this.groupModel.countDocuments({ status: 'open' }),
      this.eventModel.distinct('userId', window),
    ]);
    return {
      errorsLast24h: total - warningsLast24h,
      warningsLast24h,
      openGroups,
      usersAffectedLast24h: users.length,
    };
  }

  async listGroups(q: ListGroupsQueryDto): Promise<{
    items: ErrorGroupView[];
    total: number;
    page: number;
    limit: number;
  }> {
    const page = q.page ?? 1;
    const limit = q.limit ?? 25;
    const severity = q.severity ?? 'error';
    const status = q.status ?? 'open';

    const filter: Record<string, unknown> = {};
    if (severity !== 'all') filter.severity = severity;
    if (status !== 'all') filter.status = status;
    if (q.source) filter.source = q.source;
    if (q.q) {
      const pattern = q.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.$or = [
        { message: { $regex: pattern, $options: 'i' } },
        { route: { $regex: pattern, $options: 'i' } },
      ];
    }

    const [groups, total] = await Promise.all([
      this.groupModel
        .find(filter)
        .sort({ lastSeen: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      this.groupModel.countDocuments(filter),
    ]);
    return { items: groups.map((g) => this.toView(g)), total, page, limit };
  }

  async getGroup(
    id: string,
  ): Promise<{ group: ErrorGroupView; events: ErrorEvent[] }> {
    if (!validId(id)) throw new NotFoundException('Error group not found');
    const group = await this.groupModel.findById(id).lean();
    if (!group) throw new NotFoundException('Error group not found');
    const events = await this.eventModel
      .find({ groupId: id })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();
    return { group: this.toView(group), events: events as ErrorEvent[] };
  }

  async setStatus(
    id: string,
    status: 'open' | 'resolved',
    userId: string,
  ): Promise<ErrorGroupView> {
    if (!validId(id)) throw new NotFoundException('Error group not found');
    const update =
      status === 'resolved'
        ? {
            $set: {
              status,
              resolvedAt: new Date(),
              resolvedBy: new Types.ObjectId(userId),
            },
          }
        : {
            $set: { status },
            $unset: { resolvedAt: 1, resolvedBy: 1 },
          };
    const group = await this.groupModel
      .findByIdAndUpdate(id, update, { new: true })
      .lean();
    if (!group) throw new NotFoundException('Error group not found');
    return this.toView(group);
  }

  private toView(group: ErrorGroup): ErrorGroupView {
    const { affectedUserIds, affectedOrgIds, _id, ...rest } = group;
    return {
      ...rest,
      _id: _id.toString(),
      usersAffected: affectedUserIds?.length ?? 0,
      orgsAffected: affectedOrgIds?.length ?? 0,
    };
  }

  private async safely(
    step: string,
    fn: () => Promise<unknown>,
  ): Promise<void> {
    try {
      await fn();
    } catch (err) {
      this.warn(step, err);
    }
  }

  private warn(step: string, err: unknown): void {
    this.logger.warn(
      `Failed to record diagnostics (${step}): ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}
