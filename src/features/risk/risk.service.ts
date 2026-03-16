import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import mongoose from 'mongoose';
import { Risk } from './risk.entity';
import { CreateRiskDto } from './dto/create-risk.dto';
import { UpdateRiskDto } from './dto/update-risk.dto';
import { InitiativeService } from '../initiative/initiative.service';

@Injectable()
export class RiskService {
  constructor(
    @InjectModel('Risk') private readonly model: Model<Risk>,
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

  /** Count by severity for dashboard. */
  async countBySeverity(organizationId: string): Promise<{ high: number; critical: number; open: number }> {
    const [high, critical, open] = await Promise.all([
      this.model.countDocuments({ organizationId: new mongoose.Types.ObjectId(organizationId), severity: 'High' }).exec(),
      this.model.countDocuments({ organizationId: new mongoose.Types.ObjectId(organizationId), severity: 'Critical' }).exec(),
      this.model.countDocuments({
        organizationId: new mongoose.Types.ObjectId(organizationId),
        status: { $in: ['Open', 'Mitigating'] },
      }).exec(),
    ]);
    return { high, critical, open };
  }
}
