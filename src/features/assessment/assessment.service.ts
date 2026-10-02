import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import mongoose from 'mongoose';
import { Assessment } from './assessment.entity';
import { CreateAssessmentDto } from './dto/create-assessment.dto';
import { SaveAssessmentDraftDto } from './dto/save-assessment-draft.dto';
import { UserRole } from '../auth/user.entity';

/** Excludes drafts. Legacy records have no `status`, so `$ne` (not `status: 'PUBLISHED'`). */
const NOT_DRAFT = { status: { $ne: 'DRAFT' } } as const;

function toObjectIdOrUndefined(id?: string): mongoose.Types.ObjectId | undefined {
  const v = id?.trim();
  return v && mongoose.Types.ObjectId.isValid(v) ? new mongoose.Types.ObjectId(v) : undefined;
}

/** Published assessments must belong to an initiative. */
function assertInitiativeId(id?: string): void {
  if (!toObjectIdOrUndefined(id)) {
    throw new HttpException('Related initiative is required.', HttpStatus.BAD_REQUEST);
  }
}

/** Maps create / draft input to stored fields. Only keys present in the input are returned. */
function buildAssessmentFields(dto: Partial<CreateAssessmentDto>) {
  const fields: Record<string, unknown> = {};
  if (dto.name !== undefined) fields.name = dto.name ?? '';
  // null (not undefined) so clearing a field in a draft is persisted; Mongoose drops undefined from $set.
  if (dto.initiativeId !== undefined) fields.initiativeId = toObjectIdOrUndefined(dto.initiativeId) ?? null;
  if (dto.ownerId !== undefined) fields.ownerId = toObjectIdOrUndefined(dto.ownerId) ?? null;
  if (dto.dueDate !== undefined) fields.dueDate = dto.dueDate ? new Date(dto.dueDate) : null;
  if (dto.audience !== undefined) fields.audience = dto.audience ?? '';
  if (dto.audienceDepartments !== undefined) fields.audienceDepartments = dto.audienceDepartments ?? [];
  if (dto.description !== undefined) fields.description = dto.description ?? '';
  if (dto.steps !== undefined) {
    fields.steps = (dto.steps ?? []).map((s) => {
      const questions = s.questions ?? [];
      const rawP = s.pillars ?? [];
      const pillars = questions.map((_, i) => {
        const p = String(rawP[i] ?? '')
          .trim()
          .toUpperCase();
        return p === 'N' || p === 'A' || p === 'V' || p === 'I' ? p : '';
      });
      return { title: s.title ?? '', questions, pillars };
    });
  }
  return fields;
}

/** Audience value from create form: who can see and take this assessment. */
const AUDIENCE_TO_ROLES: Record<string, UserRole[]> = {
  'all-roles': [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MANAGER, UserRole.EMPLOYEE],
  leadership: [UserRole.ADMIN, UserRole.SUPER_ADMIN],
  admin: [UserRole.ADMIN, UserRole.SUPER_ADMIN],
  managers: [UserRole.MANAGER],
  'all-employees': [UserRole.EMPLOYEE],
  department: [], // checked via audienceDepartments + user departments
};

function canUserSeeAudience(
  audience: string | undefined,
  userRole: string,
  userDepartments?: string[],
  audienceDepartments?: string[],
): boolean {
  const a = (audience || '').trim();
  if (!a) return true;
  if (a === 'department') {
    if (!audienceDepartments?.length) return true;
    if (!userDepartments?.length) return false;
    const deptSet = new Set(audienceDepartments.map((d) => d.trim().toLowerCase()));
    return userDepartments.some((d) => deptSet.has(String(d).trim().toLowerCase()));
  }
  const allowed = AUDIENCE_TO_ROLES[a];
  if (!allowed) return true;
  return allowed.some((r) => r === userRole);
}

@Injectable()
export class AssessmentService {
  constructor(
    @InjectModel('Assessment') private readonly assessmentModel: Model<Assessment>,
  ) {}

  async create(
    dto: CreateAssessmentDto,
    organizationId: string,
    createdById?: string,
  ): Promise<Assessment> {
    assertInitiativeId(dto.initiativeId);
    const doc = await this.assessmentModel.create({
      audience: '',
      audienceDepartments: [],
      description: '',
      steps: [],
      ...buildAssessmentFields(dto),
      organizationId: new mongoose.Types.ObjectId(organizationId),
      createdById: toObjectIdOrUndefined(createdById),
      status: 'PUBLISHED',
      completed: false,
    });
    return doc;
  }

  // ---- Drafts (admin only; never visible to takers) ----

  /** Create a draft, or update an existing one when `draftId` is given. */
  async saveDraft(
    dto: SaveAssessmentDraftDto,
    organizationId: string,
    createdById?: string,
    draftId?: string,
  ): Promise<Assessment> {
    const orgOid = new mongoose.Types.ObjectId(organizationId);
    const fields = buildAssessmentFields(dto);
    if (!draftId) {
      return this.assessmentModel.create({
        name: '',
        ...fields,
        organizationId: orgOid,
        createdById: toObjectIdOrUndefined(createdById),
        status: 'DRAFT',
        completed: false,
      });
    }
    const id = toObjectIdOrUndefined(draftId);
    if (!id) throw new HttpException('Draft not found.', HttpStatus.NOT_FOUND);
    const updated = await this.assessmentModel
      .findOneAndUpdate({ _id: id, organizationId: orgOid, status: 'DRAFT' }, { $set: fields }, { new: true })
      .lean()
      .exec();
    if (!updated) throw new HttpException('Draft not found.', HttpStatus.NOT_FOUND);
    return updated as Assessment;
  }

  async listDrafts(organizationId: string): Promise<Assessment[]> {
    const list = await this.assessmentModel
      .find({ organizationId: new mongoose.Types.ObjectId(organizationId), status: 'DRAFT' })
      .sort({ updatedAt: -1 })
      .lean()
      .exec();
    return list as Assessment[];
  }

  async findDraft(id: string, organizationId: string): Promise<Assessment | null> {
    const oid = toObjectIdOrUndefined(id);
    if (!oid) return null;
    const doc = await this.assessmentModel
      .findOne({ _id: oid, organizationId: new mongoose.Types.ObjectId(organizationId), status: 'DRAFT' })
      .lean()
      .exec();
    return doc as Assessment | null;
  }

  async deleteDraft(id: string, organizationId: string): Promise<{ deleted: boolean }> {
    const oid = toObjectIdOrUndefined(id);
    if (!oid) return { deleted: false };
    const res = await this.assessmentModel
      .deleteOne({ _id: oid, organizationId: new mongoose.Types.ObjectId(organizationId), status: 'DRAFT' })
      .exec();
    return { deleted: res.deletedCount > 0 };
  }

  /** Publish a draft with its final (fully validated) values, making it visible to its audience. */
  async publishDraft(id: string, dto: CreateAssessmentDto, organizationId: string): Promise<Assessment> {
    assertInitiativeId(dto.initiativeId);
    const oid = toObjectIdOrUndefined(id);
    if (!oid) throw new HttpException('Draft not found.', HttpStatus.NOT_FOUND);
    const published = await this.assessmentModel
      .findOneAndUpdate(
        { _id: oid, organizationId: new mongoose.Types.ObjectId(organizationId), status: 'DRAFT' },
        { $set: { ...buildAssessmentFields(dto), status: 'PUBLISHED' } },
        { new: true },
      )
      .lean()
      .exec();
    if (!published) throw new HttpException('Draft not found or already published.', HttpStatus.NOT_FOUND);
    return published as Assessment;
  }

  /** List all assessments for an initiative (org-scoped). Used on initiative detail page to show all with audience; frontend filters Take by role. */
  async findAllByInitiativeId(initiativeId: string, organizationId: string): Promise<Assessment[]> {
    const oid = new mongoose.Types.ObjectId(initiativeId);
    const orgOid = new mongoose.Types.ObjectId(organizationId);
    const list = await this.assessmentModel
      .find({ initiativeId: oid, organizationId: orgOid, ...NOT_DRAFT })
      .sort({ createdAt: -1 })
      .lean()
      .exec();
    return list as Assessment[];
  }

  async findByInitiativeId(initiativeId: string, userRole?: string): Promise<Assessment | null> {
    const oid = new mongoose.Types.ObjectId(initiativeId);
    const doc = await this.assessmentModel
      .findOne({ initiativeId: oid, ...NOT_DRAFT })
      .sort({ createdAt: -1 })
      .lean()
      .exec();
    const assessment = doc as Assessment | null;
    if (!assessment || !userRole) return assessment;
    if (!canUserSeeAudience(assessment.audience, userRole)) return null;
    return assessment;
  }

  async findById(id: string, organizationId: string): Promise<Assessment | null> {
    const oid = new mongoose.Types.ObjectId(id);
    const orgOid = new mongoose.Types.ObjectId(organizationId);
    const doc = await this.assessmentModel
      .findOne({ _id: oid, organizationId: orgOid, ...NOT_DRAFT })
      .lean()
      .exec();
    return doc as Assessment | null;
  }

  async findByInitiativeIdOrThrow(initiativeId: string): Promise<Assessment> {
    const found = await this.findByInitiativeId(initiativeId);
    if (!found) {
      throw new HttpException(
        'No assessment found for this initiative.',
        HttpStatus.NOT_FOUND,
      );
    }
    return found;
  }

  async findAllByOrganization(organizationId: string, userRole?: string): Promise<Assessment[]> {
    const oid = new mongoose.Types.ObjectId(organizationId);
    const list = await this.assessmentModel
      .find({ organizationId: oid, ...NOT_DRAFT })
      .sort({ createdAt: -1 })
      .lean()
      .exec();
    const assessments = list as Assessment[];
    if (!userRole) return [];
    return assessments.filter((a) => canUserSeeAudience(a.audience, userRole));
  }

  async update(
    id: string,
    updates: { completed?: boolean; overallScore?: number; riskLevel?: string },
    organizationId?: string,
  ): Promise<Assessment | null> {
    const oid = new mongoose.Types.ObjectId(id);
    const filter: {
      _id: mongoose.Types.ObjectId;
      organizationId?: mongoose.Types.ObjectId;
      status: { $ne: 'DRAFT' };
    } = { _id: oid, ...NOT_DRAFT };
    if (organizationId) {
      filter.organizationId = new mongoose.Types.ObjectId(organizationId);
    }
    const doc = await this.assessmentModel
      .findOneAndUpdate(filter, { $set: updates }, { new: true })
      .lean()
      .exec();
    return doc as Assessment | null;
  }
}
