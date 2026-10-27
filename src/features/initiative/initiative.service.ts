import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model } from 'mongoose';
import mongoose from 'mongoose';
import * as fs from 'fs';
import * as path from 'path';
import { Initiative } from './initiative.entity';
import { CreateInitiativeDto } from './dto/create-initiative.dto';
import { UpdateInitiativeDto } from './dto/update-initiative.dto';
import { Task } from '../task/task.entity';
import { User } from '../auth/user.entity';
import { NOT_ARCHIVED, ONLY_ARCHIVED } from '../../utils/archive';

export type InitiativeParticipationRole = 'lead' | 'raci' | 'assignee';

/** Collections whose records belong to an initiative and are removed with it on permanent delete. */
const INITIATIVE_CHILD_MODELS = [
  'Risk',
  'Communication',
  'Stakeholder',
  'Adoption',
  'KudosContribution',
  'Assessment',
  'AssessmentSubmission',
  'AiEmbedding',
] as const;

/** Same folder the Knowledge Hub stores uploaded files in. */
const KNOWLEDGE_UPLOAD_DIR = path.join(process.cwd(), 'uploads', 'knowledge');

@Injectable()
export class InitiativeService {
  private readonly logger = new Logger(InitiativeService.name);

  constructor(
    @InjectModel('Initiative') private readonly initiativeModel: Model<Initiative>,
    @InjectModel('Task') private readonly taskModel: Model<Task>,
    @InjectModel('User') private readonly userModel: Model<User>,
    @InjectConnection() private readonly connection: Connection,
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

  /** Active (non-archived) initiatives by default; pass `{ archived: true }` for the archive view. */
  async findAllByOrganization(
    organizationId: string,
    opts: { archived?: boolean } = {},
  ): Promise<Initiative[]> {
    const id = this.toObjectId(organizationId);
    if (!id) throw new HttpException('Invalid organization', HttpStatus.BAD_REQUEST);
    const docs = await this.initiativeModel
      .find({ organizationId: id, ...(opts.archived ? ONLY_ARCHIVED : NOT_ARCHIVED) })
      .sort({ updatedAt: -1 })
      .lean()
      .exec();
    return this.withLiveLeadNames(docs as Initiative[], id);
  }

  /**
   * Replaces each initiative's cached `leadName` with the lead's current profile name, so a rename
   * shows everywhere without re-saving initiatives. Older initiatives saved before `leadUserId`
   * existed are linked to their lead once, when exactly one org member has the stored name.
   */
  private async withLiveLeadNames(docs: Initiative[], orgId: mongoose.Types.ObjectId): Promise<Initiative[]> {
    if (docs.length === 0) return docs;
    const unlinked = docs.filter((d) => !d.leadUserId && String(d.leadName ?? '').trim());
    const linkedIds = docs.filter((d) => d.leadUserId).map((d) => d.leadUserId as mongoose.Types.ObjectId);
    if (unlinked.length === 0 && linkedIds.length === 0) return docs;

    // Linking needs the whole org; otherwise only the referenced users.
    const users = (await this.userModel
      .find(unlinked.length ? { organizationId: orgId } : { _id: { $in: linkedIds }, organizationId: orgId })
      .select('_id name')
      .lean()
      .exec()) as Array<{ _id: mongoose.Types.ObjectId; name?: string }>;
    const nameById = new Map(users.map((u) => [u._id.toString(), u.name ?? '']));

    if (unlinked.length) {
      const idsByName = new Map<string, mongoose.Types.ObjectId[]>();
      for (const u of users) {
        const key = String(u.name ?? '').trim().toLowerCase();
        if (!key) continue;
        idsByName.set(key, [...(idsByName.get(key) ?? []), u._id]);
      }
      const links: Array<{ updateOne: { filter: object; update: object } }> = [];
      for (const d of unlinked) {
        const matches = idsByName.get(String(d.leadName).trim().toLowerCase()) ?? [];
        if (matches.length !== 1) continue; // unknown or ambiguous name: leave as text
        d.leadUserId = matches[0];
        links.push({
          updateOne: { filter: { _id: d._id, leadUserId: { $exists: false } }, update: { $set: { leadUserId: matches[0] } } },
        });
      }
      if (links.length) await this.initiativeModel.bulkWrite(links as never);
    }

    for (const d of docs) {
      const live = d.leadUserId ? nameById.get(d.leadUserId.toString()) : undefined;
      // A deleted user keeps the last known name.
      if (live) d.leadName = live;
    }
    return docs;
  }

  /** Validates that the lead belongs to the organization and returns their ID and current name. */
  private async resolveLead(
    leadUserId: string,
    orgId: mongoose.Types.ObjectId,
  ): Promise<{ leadUserId: mongoose.Types.ObjectId; leadName: string }> {
    const uid = this.toObjectId(leadUserId);
    const lead = uid
      ? await this.userModel.findOne({ _id: uid, organizationId: orgId }).select('_id name').lean().exec()
      : null;
    if (!lead) throw new HttpException('Change lead must be a member of your organization.', HttpStatus.BAD_REQUEST);
    return { leadUserId: lead._id as mongoose.Types.ObjectId, leadName: (lead as { name?: string }).name ?? '' };
  }

  /** True when the user is the initiative's change lead (by ID; by name for initiatives not yet linked). */
  isLead(initiative: Initiative, user: Partial<User>): boolean {
    const me = (user as { _id?: { toString: () => string } })._id?.toString?.();
    if (initiative.leadUserId) return Boolean(me) && initiative.leadUserId.toString() === me;
    const lead = String(initiative.leadName ?? '').trim().toLowerCase();
    return Boolean(lead) && lead === String(user.name ?? '').trim().toLowerCase();
  }

  /** IDs of archived initiatives, so org-wide lists and rollups can leave their records out. */
  async findArchivedIds(organizationId: string): Promise<mongoose.Types.ObjectId[]> {
    const orgId = this.toObjectId(organizationId);
    if (!orgId) return [];
    const docs = await this.initiativeModel
      .find({ organizationId: orgId, ...ONLY_ARCHIVED })
      .select('_id')
      .lean()
      .exec();
    return docs.map((d) => d._id as mongoose.Types.ObjectId);
  }

  async archive(id: string, organizationId: string, archivedById?: string): Promise<Initiative | null> {
    const initId = this.toObjectId(id);
    const orgId = this.toObjectId(organizationId);
    if (!initId || !orgId) return null;
    const doc = await this.initiativeModel
      .findOneAndUpdate(
        { _id: initId, organizationId: orgId },
        {
          $set: {
            archivedAt: new Date(),
            archivedById: archivedById ? this.toObjectId(archivedById) ?? undefined : undefined,
          },
        },
        { new: true },
      )
      .lean()
      .exec();
    return doc as Initiative | null;
  }

  async restore(id: string, organizationId: string): Promise<Initiative | null> {
    const initId = this.toObjectId(id);
    const orgId = this.toObjectId(organizationId);
    if (!initId || !orgId) return null;
    const doc = await this.initiativeModel
      .findOneAndUpdate(
        { _id: initId, organizationId: orgId },
        { $set: { archivedAt: null }, $unset: { archivedById: 1 } },
        { new: true },
      )
      .lean()
      .exec();
    return doc as Initiative | null;
  }

  /**
   * Permanently deletes an archived initiative and everything that belongs to it: roadmap tasks
   * (and their comments), risks, communications, stakeholders, adoption milestones, kudos,
   * Knowledge Hub entries (and uploaded files), assessments with their submissions, and AI caches.
   * Only archived initiatives can be deleted, so a delete is always a deliberate second step.
   */
  async deletePermanently(id: string, organizationId: string): Promise<boolean> {
    const initId = this.toObjectId(id);
    const orgId = this.toObjectId(organizationId);
    if (!initId || !orgId) return false;
    const existing = await this.initiativeModel
      .findOne({ _id: initId, organizationId: orgId, ...ONLY_ARCHIVED })
      .select('_id')
      .lean()
      .exec();
    if (!existing) return false;

    const byInitiative = { organizationId: orgId, initiativeId: initId };

    const taskIds = (await this.taskModel.find(byInitiative).select('_id').lean().exec()).map((t) => t._id);
    if (taskIds.length) {
      await this.connection.model('TaskComment').deleteMany({ organizationId: orgId, taskId: { $in: taskIds } }).exec();
    }
    await this.taskModel.deleteMany(byInitiative).exec();

    const entryModel = this.connection.model('KnowledgeEntry');
    const entries = (await entryModel.find(byInitiative).select('_id storedFileName').lean().exec()) as Array<{
      _id: mongoose.Types.ObjectId;
      storedFileName?: string;
    }>;
    if (entries.length) {
      await this.connection
        .model('KnowledgeSolutionVote')
        .deleteMany({ organizationId: orgId, entryId: { $in: entries.map((e) => e._id) } })
        .exec();
      for (const e of entries) {
        if (!e.storedFileName) continue;
        try {
          fs.unlinkSync(path.join(KNOWLEDGE_UPLOAD_DIR, e.storedFileName));
        } catch {
          // A missing file should not block the delete; the database records are what matter.
        }
      }
      await entryModel.deleteMany(byInitiative).exec();
    }

    for (const name of INITIATIVE_CHILD_MODELS) {
      await this.connection.model(name).deleteMany(byInitiative).exec();
    }

    const res = await this.initiativeModel.deleteOne({ _id: initId, organizationId: orgId }).exec();
    this.logger.log(`Permanently deleted initiative ${id} (org ${organizationId}) and its related records.`);
    return res.deletedCount > 0;
  }

  async findOne(id: string, organizationId: string): Promise<Initiative | null> {
    const initId = this.toObjectId(id);
    const orgId = this.toObjectId(organizationId);
    if (!initId || !orgId) return null;
    const doc = await this.initiativeModel
      .findOne({ _id: initId, organizationId: orgId })
      .lean()
      .exec();
    if (!doc) return null;
    const [withName] = await this.withLiveLeadNames([doc as Initiative], orgId);
    return withName;
  }

  async create(dto: CreateInitiativeDto, organizationId: string, createdById?: string): Promise<Initiative> {
    const orgId = this.toObjectId(organizationId);
    if (!orgId) throw new HttpException('Invalid organization', HttpStatus.BAD_REQUEST);

    const normalizedRaci = this.normalizeRaci(dto as unknown as { [key: string]: unknown } as any);
    const lead = dto.leadUserId ? await this.resolveLead(dto.leadUserId, orgId) : {};
    const created = await this.initiativeModel.create({
      ...dto,
      ...lead,
      organizationId: orgId,
      createdById: createdById ? this.toObjectId(createdById) ?? undefined : undefined,
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

    const updatePayload: Record<string, unknown> = {
      ...dto,
      changeType: dto.changeType ?? (existing as Initiative).changeType ?? 'Other',
      raciAccountableIds: normalizedRaci.raciAccountableIds,
      raciResponsibleIds: normalizedRaci.raciResponsibleIds,
      raciConsultedIds: normalizedRaci.raciConsultedIds,
      raciInformedIds: normalizedRaci.raciInformedIds,
    };

    // The lead is set by user ID. A name-only change (older clients) that no longer matches the
    // linked user unlinks it, so the initiative is matched to the right person by name again.
    const unset: Record<string, 1> = {};
    if (dto.leadUserId) {
      Object.assign(updatePayload, await this.resolveLead(dto.leadUserId, orgId));
    } else if (dto.leadName !== undefined && (existing as Initiative).leadUserId) {
      const [current] = await this.withLiveLeadNames([{ ...(existing as Initiative) }], orgId);
      const same = (n?: string) => String(n ?? '').trim().toLowerCase();
      if (same(dto.leadName) === same(current.leadName)) {
        updatePayload.leadName = current.leadName; // unchanged lead: refresh the cached name
      } else {
        unset.leadUserId = 1;
      }
    }

    const updated = await this.initiativeModel
      .findOneAndUpdate(
        { _id: initId, organizationId: orgId },
        { $set: updatePayload, ...(Object.keys(unset).length ? { $unset: unset } : {}) },
        { new: true },
      )
      .lean()
      .exec();
    if (!updated) return null;
    const [withName] = await this.withLiveLeadNames([updated as Initiative], orgId);
    return withName;
  }

  /** Deletes a DRAFT initiative only (callers check for linked records first). */
  async deleteDraft(id: string, organizationId: string): Promise<boolean> {
    const initId = this.toObjectId(id);
    const orgId = this.toObjectId(organizationId);
    if (!initId || !orgId) return false;
    const res = await this.initiativeModel
      .deleteOne({ _id: initId, organizationId: orgId, status: 'DRAFT' })
      .exec();
    return res.deletedCount > 0;
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

    // Drafts are private work in progress, so they don't count as participation / RACI yet.
    const initiatives = await this.withLiveLeadNames(
      (await this.initiativeModel
        .find({ organizationId: orgOid, status: { $ne: 'DRAFT' }, ...NOT_ARCHIVED })
        .lean()
        .exec()) as Initiative[],
      orgOid,
    );
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
      if (this.isLead(raw as Initiative, user)) roles.push('lead');

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
    // Drafts are private work in progress, so they don't count as participation / RACI yet.
    const initiatives = await this.initiativeModel
      .find({ organizationId: orgOid, status: { $ne: 'DRAFT' }, ...NOT_ARCHIVED })
      .lean()
      .exec();
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
