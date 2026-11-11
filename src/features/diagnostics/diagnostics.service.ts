import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { LIMITS, RecordErrorInput } from './diagnostics.types';
import { computeFingerprint, normalizeMessage } from './fingerprint';
import { maskEmails, redactUrl, truncate } from './sanitize';
import { ErrorGroup } from './error-group.entity';
import { ErrorEvent } from './error-event.entity';

const AFFECTED_CAP = 500;

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
      const fingerprint = computeFingerprint(input);
      const set: Record<string, unknown> = {
        lastSeen: now,
        severity: input.severity,
        message: truncate(normalizeMessage(input.message), LIMITS.message),
      };
      if (input.statusCode !== undefined) set.statusCode = input.statusCode;
      if (input.route !== undefined) set.route = input.route;

      const update: Record<string, unknown> = {
        $inc: { count: 1 },
        $set: set,
        $setOnInsert: {
          firstSeen: now,
          source: input.source,
          kind: input.kind,
          name: input.name,
          status: 'open',
        },
      };
      if (input.user?.role) update.$addToSet = { roles: input.user.role };

      const group = await this.groupModel.findOneAndUpdate(
        { fingerprint },
        update,
        { upsert: true, new: true },
      );

      if (group) {
        if (group.status === 'resolved') {
          await this.groupModel.updateOne(
            { _id: group._id },
            {
              $set: { status: 'open' },
              $unset: { resolvedAt: 1, resolvedBy: 1 },
            },
          );
        }
        const userId = input.user?.id;
        if (userId && (group.affectedUserIds?.length ?? 0) < AFFECTED_CAP) {
          await this.groupModel.updateOne(
            { _id: group._id },
            { $addToSet: { affectedUserIds: userId } },
          );
        }
        const orgId = input.user?.organizationId;
        if (orgId && (group.affectedOrgIds?.length ?? 0) < AFFECTED_CAP) {
          await this.groupModel.updateOne(
            { _id: group._id },
            { $addToSet: { affectedOrgIds: orgId } },
          );
        }
      }

      await this.eventModel.create({
        groupId: group?._id,
        name: input.name,
        message: truncate(maskEmails(input.message), LIMITS.message),
        stack: input.stack ? truncate(input.stack, LIMITS.stack) : undefined,
        componentStack: input.componentStack
          ? truncate(input.componentStack, LIMITS.componentStack)
          : undefined,
        statusCode: input.statusCode,
        method: input.method,
        path: input.path ? redactUrl(input.path) : undefined,
        pageUrl: input.pageUrl ? redactUrl(input.pageUrl) : undefined,
        userId: input.user?.id,
        userRole: input.user?.role,
        organizationId: input.user?.organizationId,
        userEmail: input.user?.email,
        userAgent: input.userAgent,
        ip: input.ip,
        appVersion: input.appVersion,
      });
    } catch (err) {
      this.logger.warn(
        `Failed to record diagnostics: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
