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

  private normalizeRaci(dto: {
    raciAccountableIds?: string[];
    raciResponsibleIds?: string[];
    raciConsultedIds?: string[];
    raciInformedIds?: string[];
  }): {
    raciAccountableIds: string[];
    raciResponsibleIds: string[];
    raciConsultedIds: string[];
    raciInformedIds: string[];
  } {
    const accountableRaw = Array.isArray(dto.raciAccountableIds) ? dto.raciAccountableIds : [];
    if (accountableRaw.length > 1) {
      throw new HttpException('Only one accountable person is allowed.', HttpStatus.BAD_REQUEST);
    }

    const accountableId = accountableRaw[0] ?? undefined;
    const responsibleRaw = Array.isArray(dto.raciResponsibleIds) ? dto.raciResponsibleIds : [];
    const consultedRaw = Array.isArray(dto.raciConsultedIds) ? dto.raciConsultedIds : [];
    const informedRaw = Array.isArray(dto.raciInformedIds) ? dto.raciInformedIds : [];

    // Ensure a user can't appear in multiple RACI buckets.
    const responsible = Array.from(new Set(responsibleRaw.filter((id) => id !== accountableId)));
    const consulted = Array.from(
      new Set(consultedRaw.filter((id) => id !== accountableId && !responsible.includes(id))),
    );
    const informed = Array.from(
      new Set(informedRaw.filter((id) => id !== accountableId && !responsible.includes(id) && !consulted.includes(id))),
    );

    const nonAccountableTotal = responsible.length + consulted.length + informed.length;
    if (nonAccountableTotal > 10) {
      throw new HttpException('Up to 10 people can be Responsible/Consulted/Informed.', HttpStatus.BAD_REQUEST);
    }

    return {
      raciAccountableIds: accountableId ? [accountableId] : [],
      raciResponsibleIds: responsible,
      raciConsultedIds: consulted,
      raciInformedIds: informed,
    };
  }

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

    const normalizedRaci = this.normalizeRaci(dto as unknown as { [key: string]: unknown } as any);
    const created = await this.initiativeModel.create({
      ...dto,
      organizationId: orgId,
      status: (dto.status as Initiative['status']) ?? 'DRAFT',
      departments: dto.departments ?? [],
      goals: dto.goals ?? [],
      faqs: dto.faqs ?? [],
      progress: dto.progress ?? 0,
      changeType: dto.changeType ?? 'Other',
      raciAccountableIds: normalizedRaci.raciAccountableIds,
      raciResponsibleIds: normalizedRaci.raciResponsibleIds,
      raciConsultedIds: normalizedRaci.raciConsultedIds,
      raciInformedIds: normalizedRaci.raciInformedIds,
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
    const existing = await this.initiativeModel
      .findOne({ _id: initId, organizationId: orgId })
      .lean()
      .exec();
    if (!existing) return null;

    const normalizedRaci = this.normalizeRaci({
      raciAccountableIds: dto.raciAccountableIds ?? (existing as Initiative).raciAccountableIds,
      raciResponsibleIds: dto.raciResponsibleIds ?? (existing as Initiative).raciResponsibleIds,
      raciConsultedIds: dto.raciConsultedIds ?? (existing as Initiative).raciConsultedIds,
      raciInformedIds: dto.raciInformedIds ?? (existing as Initiative).raciInformedIds,
    });

    const updatePayload = {
      ...dto,
      changeType: dto.changeType ?? (existing as Initiative).changeType ?? 'Other',
      raciAccountableIds: normalizedRaci.raciAccountableIds,
      raciResponsibleIds: normalizedRaci.raciResponsibleIds,
      raciConsultedIds: normalizedRaci.raciConsultedIds,
      raciInformedIds: normalizedRaci.raciInformedIds,
    };

    const updated = await this.initiativeModel
      .findOneAndUpdate(
        { _id: initId, organizationId: orgId },
        { $set: updatePayload },
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
