import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import mongoose from 'mongoose';
import { AssessmentSubmission } from './assessment-submission.entity';
import { Assessment } from './assessment.entity';
import { InitiativeService } from '../initiative/initiative.service';

@Injectable()
export class AssessmentSubmissionService {
  constructor(
    @InjectModel('AssessmentSubmission') private readonly submissionModel: Model<AssessmentSubmission>,
    @InjectModel('Assessment') private readonly assessmentModel: Model<Assessment>,
    private readonly initiativeService: InitiativeService,
  ) {}

  async create(
    assessmentId: string,
    userId: string,
    organizationId: string,
    overallScore: number,
    riskLevel?: string,
  ): Promise<AssessmentSubmission> {
    const assessment = await this.assessmentModel
      .findById(new mongoose.Types.ObjectId(assessmentId))
      .lean()
      .exec();
    if (!assessment) {
      throw new HttpException('Assessment not found.', HttpStatus.NOT_FOUND);
    }
    const aid = assessment as { organizationId?: mongoose.Types.ObjectId; initiativeId?: mongoose.Types.ObjectId };
    const orgId = aid.organizationId?.toString?.() ?? (aid.organizationId as unknown as string);
    const initId = aid.initiativeId?.toString?.() ?? (aid.initiativeId as unknown as string);
    if (orgId !== organizationId) {
      throw new HttpException('Assessment does not belong to your organization.', HttpStatus.FORBIDDEN);
    }
    const initiative = await this.initiativeService.findOne(initId, organizationId);
    if (!initiative || initiative.status === 'DRAFT') {
      throw new HttpException(
        'Cannot submit assessments for an initiative in Draft. An admin must set the initiative to Active first.',
        HttpStatus.FORBIDDEN,
      );
    }
    const doc = await this.submissionModel.create({
      assessmentId: new mongoose.Types.ObjectId(assessmentId),
      initiativeId: new mongoose.Types.ObjectId(initId),
      organizationId: new mongoose.Types.ObjectId(organizationId),
      userId: new mongoose.Types.ObjectId(userId),
      overallScore,
      riskLevel: riskLevel ?? '',
    });
    return doc.toObject?.() ?? (doc as unknown as AssessmentSubmission);
  }

  async findByOrganization(organizationId: string): Promise<(AssessmentSubmission & { assessmentName?: string })[]> {
    const list = await this.findSubmissionsByQuery({ organizationId: new mongoose.Types.ObjectId(organizationId) });
    return this.enrichWithAssessmentNames(list);
  }

  async findByUser(organizationId: string, userId: string): Promise<(AssessmentSubmission & { assessmentName?: string })[]> {
    const list = await this.findSubmissionsByQuery({
      organizationId: new mongoose.Types.ObjectId(organizationId),
      userId: new mongoose.Types.ObjectId(userId),
    });
    return this.enrichWithAssessmentNames(list);
  }

  async findByInitiativeId(initiativeId: string): Promise<(AssessmentSubmission & { assessmentName?: string })[]> {
    const list = await this.findSubmissionsByQuery({ initiativeId: new mongoose.Types.ObjectId(initiativeId) });
    return this.enrichWithAssessmentNames(list);
  }

  private async findSubmissionsByQuery(
    query: { organizationId?: mongoose.Types.ObjectId; userId?: mongoose.Types.ObjectId; initiativeId?: mongoose.Types.ObjectId },
  ): Promise<AssessmentSubmission[]> {
    const list = await this.submissionModel
      .find(query)
      .sort({ createdAt: -1 })
      .lean()
      .exec();
    return list as AssessmentSubmission[];
  }

  private async enrichWithAssessmentNames(
    list: AssessmentSubmission[],
  ): Promise<(AssessmentSubmission & { assessmentName?: string })[]> {
    if (list.length === 0) return list;
    const assessmentIds = [...new Set(list.map((s) => (s.assessmentId as mongoose.Types.ObjectId)?.toString?.() ?? (s.assessmentId as unknown as string)).filter(Boolean))];
    const assessments = await this.assessmentModel
      .find({ _id: { $in: assessmentIds.map((id) => new mongoose.Types.ObjectId(id)) } })
      .select('_id name')
      .lean()
      .exec();
    const nameById: Record<string, string> = {};
    for (const a of assessments) {
      const id = (a as { _id: mongoose.Types.ObjectId })._id?.toString?.();
      if (id) nameById[id] = (a as { name: string }).name ?? '';
    }
    return list.map((s) => {
      const id = (s.assessmentId as mongoose.Types.ObjectId)?.toString?.() ?? (s.assessmentId as unknown as string);
      return { ...s, assessmentName: id ? nameById[id] : undefined };
    });
  }
}
