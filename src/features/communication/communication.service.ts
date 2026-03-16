import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import mongoose from 'mongoose';
import { Communication } from './communication.entity';
import { CreateCommunicationDto } from './dto/create-communication.dto';
import { UpdateCommunicationDto } from './dto/update-communication.dto';
import { InitiativeService } from '../initiative/initiative.service';

@Injectable()
export class CommunicationService {
  constructor(
    @InjectModel('Communication') private readonly model: Model<Communication>,
    private readonly initiativeService: InitiativeService,
  ) {}

  async create(dto: CreateCommunicationDto, organizationId: string): Promise<Communication> {
    const initiative = await this.initiativeService.findOne(dto.initiativeId, organizationId);
    if (!initiative) throw new Error('Initiative not found');
    const doc = await this.model.create({
      initiativeId: new mongoose.Types.ObjectId(dto.initiativeId),
      organizationId: new mongoose.Types.ObjectId(organizationId),
      title: dto.title.trim(),
      type: (dto.type as Communication['type']) ?? 'Email',
      audience: dto.audience?.trim() ?? '',
      scheduledDate: dto.scheduledDate ? new Date(dto.scheduledDate) : undefined,
      status: (dto.status as Communication['status']) ?? 'Planned',
      message: dto.message?.trim() ?? '',
    });
    return doc.toObject?.() ?? (doc as unknown as Communication);
  }

  async findByInitiative(initiativeId: string, organizationId: string): Promise<Communication[]> {
    const initiative = await this.initiativeService.findOne(initiativeId, organizationId);
    if (!initiative) return [];
    const list = await this.model
      .find({
        initiativeId: new mongoose.Types.ObjectId(initiativeId),
        organizationId: new mongoose.Types.ObjectId(organizationId),
      })
      .sort({ scheduledDate: 1, createdAt: -1 })
      .lean()
      .exec();
    return list as Communication[];
  }

  async findByOrganization(organizationId: string): Promise<Communication[]> {
    const list = await this.model
      .find({ organizationId: new mongoose.Types.ObjectId(organizationId) })
      .sort({ scheduledDate: 1, createdAt: -1 })
      .lean()
      .exec();
    return list as Communication[];
  }

  async update(id: string, dto: UpdateCommunicationDto, organizationId: string): Promise<Communication | null> {
    const updates: Record<string, unknown> = {};
    if (dto.title !== undefined) updates.title = dto.title.trim();
    if (dto.type !== undefined) updates.type = dto.type;
    if (dto.audience !== undefined) updates.audience = dto.audience.trim();
    if (dto.scheduledDate !== undefined) updates.scheduledDate = dto.scheduledDate ? new Date(dto.scheduledDate) : null;
    if (dto.status !== undefined) updates.status = dto.status;
    if (dto.message !== undefined) updates.message = dto.message.trim();
    if (dto.initiativeId !== undefined) updates.initiativeId = new mongoose.Types.ObjectId(dto.initiativeId);
    const doc = await this.model
      .findOneAndUpdate(
        { _id: new mongoose.Types.ObjectId(id), organizationId: new mongoose.Types.ObjectId(organizationId) },
        { $set: updates },
        { new: true },
      )
      .lean()
      .exec();
    return doc as Communication | null;
  }

  async delete(id: string, organizationId: string): Promise<boolean> {
    const result = await this.model
      .deleteOne({ _id: new mongoose.Types.ObjectId(id), organizationId: new mongoose.Types.ObjectId(organizationId) })
      .exec();
    return (result.deletedCount ?? 0) > 0;
  }
}
