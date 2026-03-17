import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import mongoose from 'mongoose';
import { Assessment } from './assessment.entity';
import { CreateAssessmentDto } from './dto/create-assessment.dto';
import { UserRole } from '../auth/user.entity';

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
  ): Promise<Assessment> {
    const steps = (dto.steps ?? []).map((s) => ({
      title: s.title ?? '',
      questions: s.questions ?? [],
    }));
    const doc = await this.assessmentModel.create({
      name: dto.name,
      initiativeId: new mongoose.Types.ObjectId(dto.initiativeId),
      organizationId: new mongoose.Types.ObjectId(organizationId),
      ownerId: dto.ownerId ? new mongoose.Types.ObjectId(dto.ownerId) : undefined,
      dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
      audience: dto.audience ?? '',
      audienceDepartments: dto.audienceDepartments ?? [],
      description: dto.description ?? '',
      steps,
      completed: false,
    });
    return doc;
  }

  /** List all assessments for an initiative (org-scoped). Used on initiative detail page to show all with audience; frontend filters Take by role. */
  async findAllByInitiativeId(initiativeId: string, organizationId: string): Promise<Assessment[]> {
    const oid = new mongoose.Types.ObjectId(initiativeId);
    const orgOid = new mongoose.Types.ObjectId(organizationId);
    const list = await this.assessmentModel
      .find({ initiativeId: oid, organizationId: orgOid })
      .sort({ createdAt: -1 })
      .lean()
      .exec();
    return list as Assessment[];
  }

  async findByInitiativeId(initiativeId: string, userRole?: string): Promise<Assessment | null> {
    const oid = new mongoose.Types.ObjectId(initiativeId);
    const doc = await this.assessmentModel
      .findOne({ initiativeId: oid })
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
      .findOne({ _id: oid, organizationId: orgOid })
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
      .find({ organizationId: oid })
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
    const filter: { _id: mongoose.Types.ObjectId; organizationId?: mongoose.Types.ObjectId } = { _id: oid };
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
