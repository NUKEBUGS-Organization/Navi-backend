import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import mongoose from 'mongoose';
import { Risk } from './risk.entity';
import { CreateRiskDto } from './dto/create-risk.dto';
import { UpdateRiskDto } from './dto/update-risk.dto';
import { InitiativeService } from '../initiative/initiative.service';
import { AssessmentSubmission } from '../assessment/assessment-submission.entity';

/** Risk level from assessment avg score: >=4 Low, 2.5-4 Medium, <2.5 High */
export interface AssessmentDerivedRiskDto {
  initiativeId: string;
  initiativeTitle: string;
  riskLevel: 'Medium' | 'High';
  avgScore: number;
  submissionCount: number;
  lastSubmittedAt?: string;
}

@Injectable()
export class RiskService {
  constructor(
    @InjectModel('Risk') private readonly model: Model<Risk>,
    @InjectModel('AssessmentSubmission') private readonly submissionModel: Model<AssessmentSubmission>,
    private readonly initiativeService: InitiativeService,
  ) {}

  async create(dto: CreateRiskDto, organizationId: string): Promise<Risk> {
    const initiative = await this.initiativeService.findOne(dto.initiativeId, organizationId);
    if (!initiative) throw new Error('Initiative not found');
    const doc = await this.model.create({
      initiativeId: new mongoose.Types.ObjectId(dto.initiativeId),
      organizationId: new mongoose.Types.ObjectId(organizationId),
      title: dto.title.trim(),
      description: dto.description?.trim() ?? '',
      severity: (dto.severity as Risk['severity']) ?? 'Medium',
      status: (dto.status as Risk['status']) ?? 'Open',
      mitigationNotes: dto.mitigationNotes?.trim() ?? '',
    });
    return doc.toObject?.() ?? (doc as unknown as Risk);
  }

  async findByInitiative(initiativeId: string, organizationId: string): Promise<Risk[]> {
    const initiative = await this.initiativeService.findOne(initiativeId, organizationId);
    if (!initiative) return [];
    const list = await this.model
      .find({
        initiativeId: new mongoose.Types.ObjectId(initiativeId),
        organizationId: new mongoose.Types.ObjectId(organizationId),
      })
      .sort({ severity: -1, createdAt: -1 })
      .lean()
      .exec();
    return list as Risk[];
  }

  async findByOrganization(organizationId: string, statusFilter?: string, severityFilter?: string): Promise<Risk[]> {
    const filter: { organizationId: mongoose.Types.ObjectId; status?: string; severity?: string } = {
      organizationId: new mongoose.Types.ObjectId(organizationId),
    };
    if (statusFilter) filter.status = statusFilter;
    if (severityFilter) filter.severity = severityFilter;
    const list = await this.model
      .find(filter)
      .sort({ severity: -1, createdAt: -1 })
      .lean()
      .exec();
    return list as Risk[];
  }

  async update(id: string, dto: UpdateRiskDto, organizationId: string): Promise<Risk | null> {
    const updates: Record<string, unknown> = {};
    if (dto.title !== undefined) updates.title = dto.title.trim();
    if (dto.description !== undefined) updates.description = dto.description.trim();
    if (dto.severity !== undefined) updates.severity = dto.severity;
    if (dto.status !== undefined) updates.status = dto.status;
    if (dto.mitigationNotes !== undefined) updates.mitigationNotes = dto.mitigationNotes.trim();
    if (dto.initiativeId !== undefined) updates.initiativeId = new mongoose.Types.ObjectId(dto.initiativeId);
    const doc = await this.model
      .findOneAndUpdate(
        { _id: new mongoose.Types.ObjectId(id), organizationId: new mongoose.Types.ObjectId(organizationId) },
        { $set: updates },
        { new: true },
      )
      .lean()
      .exec();
    return doc as Risk | null;
  }

  async delete(id: string, organizationId: string): Promise<boolean> {
    const result = await this.model
      .deleteOne({ _id: new mongoose.Types.ObjectId(id), organizationId: new mongoose.Types.ObjectId(organizationId) })
      .exec();
    return (result.deletedCount ?? 0) > 0;
  }

  /** Initiatives with medium/high risk from assessment submissions (avg score < 4). */
  async getAssessmentDerivedRisks(organizationId: string): Promise<AssessmentDerivedRiskDto[]> {
    const orgId = new mongoose.Types.ObjectId(organizationId);
    const subs = await this.submissionModel
      .find({ organizationId: orgId })
      .lean()
      .exec();
    if (subs.length === 0) return [];
    const byInit = subs.reduce<Record<string, { sum: number; count: number; lastAt?: Date }>>((acc, s) => {
      const id = (s as AssessmentSubmission).initiativeId?.toString?.() ?? (s as { initiativeId: unknown }).initiativeId as string;
      if (!id) return acc;
      if (!acc[id]) acc[id] = { sum: 0, count: 0 };
      acc[id].sum += (s as AssessmentSubmission).overallScore ?? 0;
      acc[id].count += 1;
      const at = (s as AssessmentSubmission & { createdAt?: Date }).createdAt;
      if (at && (!acc[id].lastAt || at > acc[id].lastAt!)) acc[id].lastAt = at;
      return acc;
    }, {});
    const results: AssessmentDerivedRiskDto[] = [];
    for (const [initId, data] of Object.entries(byInit)) {
      if (data.count === 0) continue;
      const avg = data.sum / data.count;
      if (avg >= 4) continue;
      const riskLevel: 'Medium' | 'High' = avg < 2.5 ? 'High' : 'Medium';
      const initiative = await this.initiativeService.findOne(initId, organizationId);
      results.push({
        initiativeId: initId,
        initiativeTitle: initiative?.title ?? 'Unknown',
        riskLevel,
        avgScore: Math.round(avg * 10) / 10,
        submissionCount: data.count,
        lastSubmittedAt: data.lastAt?.toISOString?.() ?? undefined,
      });
    }
    return results.sort((a, b) => (a.riskLevel === 'High' ? -1 : 1) - (b.riskLevel === 'High' ? -1 : 1));
  }

  /** Count by severity for dashboard. */
  async countBySeverity(
    organizationId: string,
  ): Promise<{ high: number; medium: number; low: number; open: number }> {
    // Map `Critical` into `High` for the dashboard cards.
    const orgOid = new mongoose.Types.ObjectId(organizationId);
    const [high, medium, low, open] = await Promise.all([
      this.model
        .countDocuments({ organizationId: orgOid, severity: { $in: ['High', 'Critical'] } })
        .exec(),
      this.model.countDocuments({ organizationId: orgOid, severity: 'Medium' }).exec(),
      this.model.countDocuments({ organizationId: orgOid, severity: 'Low' }).exec(),
      this.model
        .countDocuments({
          organizationId: orgOid,
          status: { $in: ['Open', 'Mitigating'] },
        })
        .exec(),
    ]);
    return { high, medium, low, open };
  }
}
