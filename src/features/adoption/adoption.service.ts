import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import mongoose from 'mongoose';
import { Adoption } from './adoption.entity';
import { CreateAdoptionDto } from './dto/create-adoption.dto';
import { UpdateAdoptionDto } from './dto/update-adoption.dto';
import { InitiativeService } from '../initiative/initiative.service';
import { computeInitiativeProgressPercent } from '../initiative/initiative-progress.util';
import { Task } from '../task/task.entity';
import { UserRole } from '../auth/user.entity';

@Injectable()
export class AdoptionService {
  constructor(
    @InjectModel('Adoption') private readonly model: Model<Adoption>,
    @InjectModel('Task') private readonly taskModel: Model<Task>,
    private readonly initiativeService: InitiativeService,
  ) {}

  private async recalcInitiativeProgress(initiativeId: string, organizationId: string): Promise<void> {
    const initId = new mongoose.Types.ObjectId(initiativeId);
    const orgId = new mongoose.Types.ObjectId(organizationId);
    const initiative = await this.initiativeService.findOne(initiativeId, organizationId);
    const [tasks, adoptionsRaw] = await Promise.all([
      this.taskModel.find({ initiativeId: initId, organizationId: orgId }).lean().exec(),
      this.model.find({ initiativeId: initId, organizationId: orgId }).lean().exec(),
    ]);
    const adoptionCounts =
      initiative && (initiative as { adoptionTrackingEnabled?: boolean }).adoptionTrackingEnabled === false
        ? []
        : adoptionsRaw;
    const progress = computeInitiativeProgressPercent(tasks as Task[], adoptionCounts as Adoption[]);
    await this.initiativeService.updateProgress(initiativeId, organizationId, progress);
  }

  async create(dto: CreateAdoptionDto, organizationId: string): Promise<Adoption> {
    const initiative = await this.initiativeService.findOne(dto.initiativeId, organizationId);
    if (!initiative) throw new Error('Initiative not found');
    const doc = await this.model.create({
      initiativeId: new mongoose.Types.ObjectId(dto.initiativeId),
      organizationId: new mongoose.Types.ObjectId(organizationId),
      milestone: dto.milestone.trim(),
      targetDate: dto.targetDate ? new Date(dto.targetDate) : undefined,
      status: (dto.status as Adoption['status']) ?? 'Not Started',
      percentAdopted: dto.percentAdopted ?? 0,
      targetPercent: dto.targetPercent ?? 100,
      notes: dto.notes?.trim() ?? '',
      visibleToEmployees: dto.visibleToEmployees ?? true,
    });
    await this.recalcInitiativeProgress(dto.initiativeId, organizationId);
    return doc.toObject?.() ?? (doc as unknown as Adoption);
  }

  async findByInitiative(
    initiativeId: string,
    organizationId: string,
    viewerRole?: UserRole,
  ): Promise<Adoption[]> {
    const initiative = await this.initiativeService.findOne(initiativeId, organizationId);
    if (!initiative) return [];
    await this.recalcInitiativeProgress(initiativeId, organizationId);
    const list = await this.model
      .find({
        initiativeId: new mongoose.Types.ObjectId(initiativeId),
        organizationId: new mongoose.Types.ObjectId(organizationId),
      })
      .sort({ targetDate: 1, createdAt: -1 })
      .lean()
      .exec();
    const trackingOn = (initiative as { adoptionTrackingEnabled?: boolean }).adoptionTrackingEnabled !== false;
    if (viewerRole === UserRole.EMPLOYEE) {
      if (!trackingOn) return [];
      return (list as Adoption[]).filter((a) => a.visibleToEmployees !== false);
    }
    return list as Adoption[];
  }

  async findByOrganization(organizationId: string): Promise<Adoption[]> {
    const list = await this.model
      .find({ organizationId: new mongoose.Types.ObjectId(organizationId) })
      .sort({ targetDate: 1, createdAt: -1 })
      .lean()
      .exec();
    return list as Adoption[];
  }

  async update(id: string, dto: UpdateAdoptionDto, organizationId: string): Promise<Adoption | null> {
    const updates: Record<string, unknown> = {};
    if (dto.milestone !== undefined) updates.milestone = dto.milestone.trim();
    if (dto.targetDate !== undefined) updates.targetDate = dto.targetDate ? new Date(dto.targetDate) : null;
    if (dto.status !== undefined) updates.status = dto.status;
    if (dto.percentAdopted !== undefined) updates.percentAdopted = Math.min(100, Math.max(0, dto.percentAdopted));
    if (dto.targetPercent !== undefined) updates.targetPercent = Math.min(100, Math.max(0, dto.targetPercent));
    if (dto.notes !== undefined) updates.notes = dto.notes.trim();
    if (dto.visibleToEmployees !== undefined) updates.visibleToEmployees = dto.visibleToEmployees;
    if (dto.initiativeId !== undefined) updates.initiativeId = new mongoose.Types.ObjectId(dto.initiativeId);
    const doc = await this.model
      .findOneAndUpdate(
        { _id: new mongoose.Types.ObjectId(id), organizationId: new mongoose.Types.ObjectId(organizationId) },
        { $set: updates },
        { new: true },
      )
      .lean()
      .exec();
    const initiativeIdForRecalc =
      dto.initiativeId ??
      ((doc as unknown as { initiativeId?: { toString?: () => string } | string })?.initiativeId
        ? String((doc as unknown as { initiativeId?: { toString?: () => string } | string }).initiativeId)
        : "");
    if (initiativeIdForRecalc) {
      await this.recalcInitiativeProgress(initiativeIdForRecalc, organizationId);
    }
    return doc as Adoption | null;
  }

  async delete(id: string, organizationId: string): Promise<boolean> {
    const existing = await this.model
      .findOne({ _id: new mongoose.Types.ObjectId(id), organizationId: new mongoose.Types.ObjectId(organizationId) })
      .lean()
      .exec();
    const result = await this.model
      .deleteOne({ _id: new mongoose.Types.ObjectId(id), organizationId: new mongoose.Types.ObjectId(organizationId) })
      .exec();
    const deleted = (result.deletedCount ?? 0) > 0;
    if (deleted && existing?.initiativeId) {
      await this.recalcInitiativeProgress(String(existing.initiativeId), organizationId);
    }
    return deleted;
  }
}
