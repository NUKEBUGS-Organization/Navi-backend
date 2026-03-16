import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import mongoose from 'mongoose';
import { Stakeholder } from './stakeholder.entity';
import { CreateStakeholderDto } from './dto/create-stakeholder.dto';
import { UpdateStakeholderDto } from './dto/update-stakeholder.dto';
import { InitiativeService } from '../initiative/initiative.service';

@Injectable()
export class StakeholderService {
  constructor(
    @InjectModel('Stakeholder') private readonly model: Model<Stakeholder>,
    private readonly initiativeService: InitiativeService,
  ) {}

  async create(dto: CreateStakeholderDto, organizationId: string): Promise<Stakeholder> {
    const initiative = await this.initiativeService.findOne(dto.initiativeId, organizationId);
    if (!initiative) throw new Error('Initiative not found');
    const doc = await this.model.create({
      initiativeId: new mongoose.Types.ObjectId(dto.initiativeId),
      organizationId: new mongoose.Types.ObjectId(organizationId),
      name: dto.name.trim(),
      role: dto.role?.trim() ?? '',
      influence: (dto.influence as Stakeholder['influence']) ?? 'Medium',
      support: (dto.support as Stakeholder['support']) ?? 'Neutral',
      notes: dto.notes?.trim() ?? '',
    });
    return doc.toObject?.() ?? (doc as unknown as Stakeholder);
  }

  async findByInitiative(initiativeId: string, organizationId: string): Promise<Stakeholder[]> {
    const initiative = await this.initiativeService.findOne(initiativeId, organizationId);
    if (!initiative) return [];
    const list = await this.model
      .find({
        initiativeId: new mongoose.Types.ObjectId(initiativeId),
        organizationId: new mongoose.Types.ObjectId(organizationId),
      })
      .sort({ createdAt: -1 })
      .lean()
      .exec();
    return list as Stakeholder[];
  }

  async findByOrganization(organizationId: string): Promise<Stakeholder[]> {
    const list = await this.model
      .find({ organizationId: new mongoose.Types.ObjectId(organizationId) })
      .sort({ createdAt: -1 })
      .lean()
      .exec();
    return list as Stakeholder[];
  }

  async update(id: string, dto: UpdateStakeholderDto, organizationId: string): Promise<Stakeholder | null> {
    const doc = await this.model
      .findOneAndUpdate(
        { _id: new mongoose.Types.ObjectId(id), organizationId: new mongoose.Types.ObjectId(organizationId) },
        {
          ...(dto.name !== undefined && { name: dto.name.trim() }),
          ...(dto.role !== undefined && { role: dto.role.trim() }),
          ...(dto.influence !== undefined && { influence: dto.influence }),
          ...(dto.support !== undefined && { support: dto.support }),
          ...(dto.notes !== undefined && { notes: dto.notes.trim() }),
          ...(dto.initiativeId !== undefined && { initiativeId: new mongoose.Types.ObjectId(dto.initiativeId) }),
        },
        { new: true },
      )
      .lean()
      .exec();
    return doc as Stakeholder | null;
  }

  async delete(id: string, organizationId: string): Promise<boolean> {
    const result = await this.model
      .deleteOne({ _id: new mongoose.Types.ObjectId(id), organizationId: new mongoose.Types.ObjectId(organizationId) })
      .exec();
    return (result.deletedCount ?? 0) > 0;
  }
}
