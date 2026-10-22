import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import mongoose, { Model } from 'mongoose';
import { Assessment } from '../assessment/assessment.entity';
import { AssessmentSubmission } from '../assessment/assessment-submission.entity';
import { User } from '../auth/user.entity';
import { AiService } from './ai.service';
import { AiContextService } from './ai-context.service';

export interface AssessmentInsights {
  respondents: number;
  averageScore: number | null;
  averageNaviIndex: number | null;
  overallReadiness: string;
  summary: string;
  strengths: string[];
  gaps: string[];
  departmentNotes: string[];
  recommendedActions: string[];
  generatedAt: string;
}

const INSIGHTS_SCHEMA = {
  type: 'object',
  properties: {
    overallReadiness: { type: 'string', description: 'Short label, e.g. "Moderate - at risk".' },
    summary: { type: 'string', description: '3-5 sentence interpretation of the results.' },
    strengths: { type: 'array', items: { type: 'string' }, description: 'Highest-scoring areas (0-4).' },
    gaps: { type: 'array', items: { type: 'string' }, description: 'Lowest-scoring areas and what they suggest (1-5).' },
    departmentNotes: {
      type: 'array',
      items: { type: 'string' },
      description: 'Notable differences between departments (0-4). Empty if not enough data.',
    },
    recommendedActions: {
      type: 'array',
      items: { type: 'string' },
      description: '3-5 concrete change-management actions that address the gaps.',
    },
  },
  required: ['overallReadiness', 'summary', 'strengths', 'gaps', 'departmentNotes', 'recommendedActions'],
  additionalProperties: false,
};

const avg = (xs: number[]): number | null =>
  xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 100) / 100 : null;

const nums = (xs: (number | undefined | null)[]): number[] =>
  xs.filter((x): x is number => typeof x === 'number' && !Number.isNaN(x));

@Injectable()
export class AiAssessmentService {
  constructor(
    private readonly ai: AiService,
    private readonly context: AiContextService,
    @InjectModel('Assessment') private readonly assessmentModel: Model<Assessment>,
    @InjectModel('AssessmentSubmission') private readonly submissionModel: Model<AssessmentSubmission>,
    @InjectModel('User') private readonly userModel: Model<User>,
  ) {}

  async summarize(assessmentId: string, organizationId: string): Promise<AssessmentInsights> {
    if (!mongoose.isValidObjectId(assessmentId)) throw new NotFoundException('Assessment not found.');
    const orgId = new mongoose.Types.ObjectId(organizationId);
    const assessment = await this.assessmentModel
      .findOne({ _id: new mongoose.Types.ObjectId(assessmentId), organizationId: orgId })
      .lean()
      .exec();
    if (!assessment) throw new NotFoundException('Assessment not found.');

    const all = await this.submissionModel
      .find({ assessmentId: assessment._id, organizationId: orgId })
      .sort({ createdAt: -1 })
      .lean()
      .exec();
    // People may re-submit; only their latest answer counts.
    const latestByUser = new Map<string, AssessmentSubmission>();
    for (const s of all) {
      const key = String(s.userId);
      if (!latestByUser.has(key)) latestByUser.set(key, s as AssessmentSubmission);
    }
    const subs = [...latestByUser.values()];
    if (!subs.length) throw new BadRequestException('This assessment has no submissions yet.');

    const users = await this.userModel
      .find({ _id: { $in: subs.map((s) => s.userId) }, organizationId: orgId })
      .select('departments')
      .lean()
      .exec();
    const deptOf = new Map(users.map((u) => [String(u._id), (u.departments ?? [])[0] || 'No department']));

    const questions: { step: string; text: string; pillar: string }[] = [];
    for (const step of assessment.steps ?? []) {
      const pillars = (step as { pillars?: string[] }).pillars ?? [];
      (step.questions ?? []).forEach((q, i) => questions.push({ step: step.title, text: q, pillar: pillars[i] ?? '' }));
    }
    const questionStats = questions
      .map((q, i) => ({ ...q, avg: avg(nums(subs.map((s) => s.answers?.[i]))) }))
      .filter((q) => q.avg !== null)
      .sort((a, b) => (a.avg ?? 0) - (b.avg ?? 0));

    const classifications = new Map<string, number>();
    for (const s of subs) {
      const c = s.naviClassification || s.riskLevel || 'Unclassified';
      classifications.set(c, (classifications.get(c) ?? 0) + 1);
    }

    const byDept = new Map<string, AssessmentSubmission[]>();
    for (const s of subs) {
      const d = deptOf.get(String(s.userId)) ?? 'No department';
      byDept.set(d, [...(byDept.get(d) ?? []), s]);
    }

    const averageScore = avg(nums(subs.map((s) => s.overallScore)));
    const averageNaviIndex = avg(nums(subs.map((s) => s.naviIndex)));
    const pillarLine = (['N', 'A', 'V', 'I'] as const)
      .map((p) => `${p}: ${avg(nums(subs.map((s) => s[`navi${p}`]))) ?? 'n/a'}`)
      .join(', ');

    const stats = [
      `Assessment: ${assessment.name}${assessment.description ? ` - ${assessment.description}` : ''}`,
      `Respondents: ${subs.length}`,
      `Average overall score: ${averageScore ?? 'n/a'}`,
      `Average NAVI index (1-5): ${averageNaviIndex ?? 'n/a'}`,
      `NAVI pillar averages (1-5): ${pillarLine}`,
      `Classification counts: ${[...classifications].map(([k, v]) => `${k}: ${v}`).join(', ')}`,
      `Question averages on a 1-5 scale, lowest first:\n${questionStats
        .map((q) => `- [${q.step}${q.pillar ? ` / ${q.pillar}` : ''}] ${q.text}: ${q.avg}`)
        .join('\n')}`,
      `By department (respondents, avg NAVI index, avg overall score):\n${[...byDept]
        .map(
          ([d, list]) =>
            `- ${d}: ${list.length}, ${avg(nums(list.map((s) => s.naviIndex))) ?? 'n/a'}, ${avg(nums(list.map((s) => s.overallScore))) ?? 'n/a'}`,
        )
        .join('\n')}`,
    ].join('\n');

    const initiative = assessment.initiativeId
      ? await this.context.getInitiative(String(assessment.initiativeId), organizationId).catch(() => null)
      : null;

    const result = await this.ai.completeJson<Omit<AssessmentInsights, 'respondents' | 'averageScore' | 'averageNaviIndex' | 'generatedAt'>>({
      system: `You are a change-readiness analyst in NAVI. Interpret employee readiness-assessment results (1-5 Likert answers; NAVI index bands: >=4.5 Excellent, >=3.8 Strong, >=3.0 Moderate/at risk, >=2.0 Weak/stalled, <2.0 Critical).
The NAVI model has four pillars: N = Navigate (leadership alignment), A = Activate (culture, trust, communication), V = Validate (execution: resources, systems, roadmap, accountability), I = Institutionalize (metrics, reinforcement, ownership, sustaining the change). Quote specific questions and numbers from the data. Never invent data.
If there are fewer than 5 respondents, or a department has fewer than 3, note that the sample is small. Write for a change manager: practical and plain.`,
      user: `${initiative ? `INITIATIVE:\n${this.context.describeInitiative(initiative)}\n\n` : ''}ASSESSMENT RESULTS:\n${stats}\n\nInterpret these results.`,
      schemaName: 'assessment_insights',
      schema: INSIGHTS_SCHEMA,
      temperature: 0.3,
    });

    return { ...result, respondents: subs.length, averageScore, averageNaviIndex, generatedAt: new Date().toISOString() };
  }
}
