import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import mongoose from 'mongoose';
import { Initiative } from './initiative.entity';
import { CreateInitiativeDto } from './dto/create-initiative.dto';
import { UpdateInitiativeDto } from './dto/update-initiative.dto';
import { Task } from '../task/task.entity';
import { User } from '../auth/user.entity';

export type InitiativeParticipationRole = 'lead' | 'raci' | 'assignee';

@Injectable()
export class InitiativeService {
  constructor(
    @InjectModel('Initiative') private readonly initiativeModel: Model<Initiative>,
    @InjectModel('Task') private readonly taskModel: Model<Task>,
    @InjectModel('User') private readonly userModel: Model<User>,
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

  /**
   * Initiatives the user is involved in: change lead, RACI participant, or has assigned tasks.
   */
  async listParticipationsForUser(
    user: Partial<User>,
    organizationId: string,
  ): Promise<
    Array<{
      id: string;
      title: string;
      status: string;
      progress: number;
      leadName: string;
      roles: InitiativeParticipationRole[];
    }>
  > {
    const userIdStr =
      user._id != null
        ? typeof user._id === 'string'
          ? user._id
          : (user._id as { toString?: () => string }).toString?.() ?? String(user._id)
        : '';
    if (!userIdStr) return [];

    const orgOid = this.toObjectId(organizationId);
    if (!orgOid) return [];

    let userOid: mongoose.Types.ObjectId;
    try {
      userOid = new mongoose.Types.ObjectId(userIdStr);
    } catch {
      return [];
    }

    const initiatives = await this.initiativeModel.find({ organizationId: orgOid }).lean().exec();
    const tasks = await this.taskModel
      .find({ organizationId: orgOid, assigneeId: userOid })
      .select('initiativeId')
      .lean()
      .exec();
    const assigneeInitiativeIds = new Set(
      tasks.map((t) => {
        const i = (t as Task).initiativeId;
        return i ? (i as mongoose.Types.ObjectId).toString() : '';
      }).filter(Boolean),
    );

    const nameLower = (user.name ?? '').trim().toLowerCase();
    const out: Array<{
      id: string;
      title: string;
      status: string;
      progress: number;
      leadName: string;
      roles: InitiativeParticipationRole[];
    }> = [];

    for (const raw of initiatives) {
      const id = (raw as { _id: mongoose.Types.ObjectId })._id.toString();
      const roles: InitiativeParticipationRole[] = [];
      const lead = String((raw as Initiative).leadName ?? '').trim().toLowerCase();
      if (lead && lead === nameLower) roles.push('lead');

      const raciIds = [
        ...((raw as Initiative).raciAccountableIds ?? []),
        ...((raw as Initiative).raciResponsibleIds ?? []),
        ...((raw as Initiative).raciConsultedIds ?? []),
        ...((raw as Initiative).raciInformedIds ?? []),
      ].map((x) => String(x));
      if (raciIds.includes(userIdStr)) roles.push('raci');

      if (assigneeInitiativeIds.has(id)) roles.push('assignee');

      if (roles.length === 0) continue;

      out.push({
        id,
        title: (raw as Initiative).title ?? 'Initiative',
        status: String((raw as Initiative).status ?? ''),
        progress: (raw as Initiative).progress ?? 0,
        leadName: (raw as Initiative).leadName ?? '',
        roles: Array.from(new Set(roles)),
      });
    }

    return out.sort((a, b) => a.title.localeCompare(b.title));
  }

  /** Combined RACI assignments across all initiatives (stakeholder rollup). */
  async getRaciRollup(organizationId: string): Promise<
    Array<{
      userId: string;
      name: string;
      email?: string;
      asAccountable: string[];
      asResponsible: string[];
      asConsulted: string[];
      asInformed: string[];
    }>
  > {
    const orgOid = this.toObjectId(organizationId);
    if (!orgOid) return [];
    const initiatives = await this.initiativeModel.find({ organizationId: orgOid }).lean().exec();
    type Acc = { A: Set<string>; R: Set<string>; C: Set<string>; I: Set<string> };
    const byUser: Record<string, Acc> = {};
    const ensure = (uid: string): Acc => {
      if (!byUser[uid]) byUser[uid] = { A: new Set(), R: new Set(), C: new Set(), I: new Set() };
      return byUser[uid];
    };
    const addTitles = (ids: string[] | undefined, bucket: keyof Acc, title: string) => {
      for (const uid of ids ?? []) {
        if (!uid) continue;
        ensure(uid)[bucket].add(title);
      }
    };
    for (const ini of initiatives) {
      const raw = ini as Initiative;
      const title = raw.title ?? 'Initiative';
      addTitles(raw.raciAccountableIds, 'A', title);
      addTitles(raw.raciResponsibleIds, 'R', title);
      addTitles(raw.raciConsultedIds, 'C', title);
      addTitles(raw.raciInformedIds, 'I', title);
    }
    const userIds = Object.keys(byUser);
    if (userIds.length === 0) return [];
    const oids = userIds.filter((id) => mongoose.Types.ObjectId.isValid(id)).map((id) => new mongoose.Types.ObjectId(id));
    const users = await this.userModel
      .find({ _id: { $in: oids }, organizationId: orgOid })
      .select('name email')
      .lean()
      .exec();
    const nameById: Record<string, { name: string; email?: string }> = {};
    for (const u of users) {
      const id = (u as { _id: { toString: () => string } })._id.toString();
      nameById[id] = { name: (u as { name?: string }).name ?? '—', email: (u as { email?: string }).email };
    }
    return userIds
      .map((userId) => ({
        userId,
        name: nameById[userId]?.name ?? userId.slice(-6),
        email: nameById[userId]?.email,
        asAccountable: [...byUser[userId].A],
        asResponsible: [...byUser[userId].R],
        asConsulted: [...byUser[userId].C],
        asInformed: [...byUser[userId].I],
      }))
      .filter(
        (row) =>
          row.asAccountable.length +
            row.asResponsible.length +
            row.asConsulted.length +
            row.asInformed.length >
          0,
      )
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  private toObjectId(value: string): mongoose.Types.ObjectId | null {
    if (!value || typeof value !== 'string') return null;
    if (mongoose.Types.ObjectId.isValid(value)) {
      return new mongoose.Types.ObjectId(value);
    }
    return null;
  }
}
