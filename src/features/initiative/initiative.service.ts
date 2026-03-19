import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import mongoose from 'mongoose';
import { Initiative } from './initiative.entity';
import { CreateInitiativeDto } from './dto/create-initiative.dto';
import { UpdateInitiativeDto } from './dto/update-initiative.dto';

@Injectable()
export class InitiativeService {
  constructor(
    @InjectModel('Initiative') private readonly initiativeModel: Model<Initiative>,
  ) {}

  async findAllByOrganization(organizationId: string): Promise<Initiative[]> {
    const id = this.toObjectId(organizationId);
    if (!id) throw new HttpException('Invalid organization', HttpStatus.BAD_REQUEST);
    return this.initiativeModel
      .find({ organizationId: id })
      .sort({ updatedAt: -1 })
      .lean()
      .exec();
  }

  async findOne(id: string, organizationId: string): Promise<Initiative | null> {
    const initId = this.toObjectId(id);
    const orgId = this.toObjectId(organizationId);
    if (!initId || !orgId) return null;
    const doc = await this.initiativeModel
      .findOne({ _id: initId, organizationId: orgId })
      .lean()
      .exec();
    return doc as Initiative | null;
  }

  async create(dto: CreateInitiativeDto, organizationId: string): Promise<Initiative> {
    const orgId = this.toObjectId(organizationId);
    if (!orgId) throw new HttpException('Invalid organization', HttpStatus.BAD_REQUEST);
    const created = await this.initiativeModel.create({
      ...dto,
      organizationId: orgId,
      status: (dto.status as Initiative['status']) ?? 'DRAFT',
      departments: dto.departments ?? [],
      goals: dto.goals ?? [],
      faqs: dto.faqs ?? [],
      progress: dto.progress ?? 0,
    });
    return created.toObject ? created.toObject() : (created as unknown as Initiative);
  }

  async update(
    id: string,
    dto: UpdateInitiativeDto,
    organizationId: string,
  ): Promise<Initiative | null> {
    const initId = this.toObjectId(id);
    const orgId = this.toObjectId(organizationId);
    if (!initId || !orgId) return null;
    const updated = await this.initiativeModel
      .findOneAndUpdate(
        { _id: initId, organizationId: orgId },
        { $set: dto },
        { new: true },
      )
      .lean()
      .exec();
    return updated as Initiative | null;
  }

  async updateProgress(initiativeId: string, organizationId: string, progress: number): Promise<void> {
    const initId = this.toObjectId(initiativeId);
    const orgId = this.toObjectId(organizationId);
    if (!initId || !orgId) return;
    const clamped = Math.min(100, Math.max(0, Math.round(progress)));
    await this.initiativeModel
      .updateOne({ _id: initId, organizationId: orgId }, { $set: { progress: clamped } })
      .exec();
  }

  private toObjectId(value: string): mongoose.Types.ObjectId | null {
    if (!value || typeof value !== 'string') return null;
    if (mongoose.Types.ObjectId.isValid(value)) {
      return new mongoose.Types.ObjectId(value);
    }
    return null;
  }
}
