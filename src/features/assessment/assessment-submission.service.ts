import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import mongoose from 'mongoose';
import { AssessmentSubmission } from './assessment-submission.entity';
import { Assessment } from './assessment.entity';
import { InitiativeService } from '../initiative/initiative.service';
import { KudosService } from '../kudos/kudos.service';
import { User } from '../auth/user.entity';
import { computeNaviFromAnswers } from '../../utils/navi-score';

@Injectable()
export class AssessmentSubmissionService {
  constructor(
    @InjectModel('AssessmentSubmission') private readonly submissionModel: Model<AssessmentSubmission>,
    @InjectModel('Assessment') private readonly assessmentModel: Model<Assessment>,
    @InjectModel('User') private readonly userModel: Model<User>,
    private readonly initiativeService: InitiativeService,
    private readonly kudosService: KudosService,
  ) {}

  /** Pillars parallel to flattened questions; uses '' for untagged (NAVI skipped for those indices). */
  private flattenPillarsForScoring(assessment: Assessment): ('N' | 'A' | 'V' | 'I' | '')[] {
    const out: ('N' | 'A' | 'V' | 'I' | '')[] = [];
    for (const step of assessment.steps ?? []) {
      const qs = step.questions ?? [];
      const ps = (step as { pillars?: string[] }).pillars ?? [];
      for (let i = 0; i < qs.length; i++) {
        const p = String(ps[i] ?? '')
          .trim()
          .toUpperCase();
        out.push(p === 'N' || p === 'A' || p === 'V' || p === 'I' ? p : '');
      }
    }
    return out;
  }

  async create(
    assessmentId: string,
    userId: string,
    organizationId: string,
    overallScore: number,
    riskLevel?: string,
    answers?: number[],
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

    const pillarsFlat = this.flattenPillarsForScoring(assessment as Assessment);
    let naviN: number | undefined;
    let naviA: number | undefined;
    let naviV: number | undefined;
    let naviI: number | undefined;
    let naviIndex: number | undefined;
    let naviClassification: string | undefined;
    let storedAnswers: number[] | undefined;

    if (answers?.length && answers.length === pillarsFlat.length) {
      storedAnswers = answers.map((a) => Math.min(5, Math.max(1, Math.round(Number(a)))));
      const navi = computeNaviFromAnswers(storedAnswers, pillarsFlat);
      if (navi) {
        naviN = navi.n;
        naviA = navi.a;
        naviV = navi.v;
        naviI = navi.i;
        naviIndex = navi.naviIndex;
        naviClassification = navi.classification;
      }
    }

    const doc = await this.submissionModel.create({
      assessmentId: new mongoose.Types.ObjectId(assessmentId),
      initiativeId: new mongoose.Types.ObjectId(initId),
      organizationId: new mongoose.Types.ObjectId(organizationId),
      userId: new mongoose.Types.ObjectId(userId),
      overallScore,
      riskLevel: riskLevel ?? '',
      answers: storedAnswers ?? [],
      naviN,
      naviA,
      naviV,
      naviI,
      naviIndex,
      naviClassification: naviClassification ?? '',
    });

    // System kudos for employee assessment submissions.
    await this.kudosService.createSystemKudosForAssessmentSubmission({
      initiativeId: initId,
      organizationId,
      assessmentSubmissionId: (doc._id as any)?.toString?.() ?? String(doc._id),
      employeeId: userId,
      assessmentTitle: (assessment as any).name ?? 'Assessment',
    });

    return doc.toObject?.() ?? (doc as unknown as AssessmentSubmission);
  }

  async getNaviAggregate(organizationId: string): Promise<{
    submissionCount: number;
    avgNaviIndex: number | null;
    avgN: number | null;
    avgA: number | null;
    avgV: number | null;
    avgI: number | null;
    leadershipAvgNavi: number | null;
    employeeAvgNavi: number | null;
    alignmentGap: number | null;
  }> {
    const list = await this.findSubmissionsByQuery({
      organizationId: new mongoose.Types.ObjectId(organizationId),
    });
    const withNavi = list.filter((s) => s.naviIndex != null && !Number.isNaN(Number(s.naviIndex)));
    if (withNavi.length === 0) {
      return {
        submissionCount: list.length,
        avgNaviIndex: null,
        avgN: null,
        avgA: null,
        avgV: null,
        avgI: null,
        leadershipAvgNavi: null,
        employeeAvgNavi: null,
        alignmentGap: null,
      };
    }
    const avg = (fn: (x: AssessmentSubmission) => number | undefined) => {
      const vals = withNavi.map(fn).filter((v): v is number => v != null && !Number.isNaN(v));
      return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
    };
    const orgOid = new mongoose.Types.ObjectId(organizationId);
    const users = await this.userModel
      .find({ organizationId: orgOid })
      .select('_id role')
      .lean()
      .exec();
    const roleByUserId: Record<string, string> = {};
    for (const u of users) {
      const id = (u as { _id: { toString: () => string } })._id.toString();
      roleByUserId[id] = String((u as { role?: string }).role ?? '');
    }
    const leadershipSubs = withNavi.filter((s) => {
      const r = roleByUserId[String(s.userId)] ?? '';
      return r === 'admin' || r === 'manager';
    });
    const employeeSubs = withNavi.filter((s) => {
      const r = roleByUserId[String(s.userId)] ?? '';
      return r === 'employee';
    });
    const avgIdx = (subs: AssessmentSubmission[]) =>
      subs.length ? subs.reduce((a, s) => a + Number(s.naviIndex), 0) / subs.length : null;
    const lAvg = avgIdx(leadershipSubs);
    const eAvg = avgIdx(employeeSubs);
    let alignmentGap: number | null = null;
    if (lAvg != null && eAvg != null) {
      alignmentGap = Math.round(Math.abs(lAvg - eAvg) * 100) / 100;
    }
    return {
      submissionCount: list.length,
      avgNaviIndex: avg((s) => s.naviIndex),
      avgN: avg((s) => s.naviN),
      avgA: avg((s) => s.naviA),
      avgV: avg((s) => s.naviV),
      avgI: avg((s) => s.naviI),
      leadershipAvgNavi: lAvg,
      employeeAvgNavi: eAvg,
      alignmentGap,
    };
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
