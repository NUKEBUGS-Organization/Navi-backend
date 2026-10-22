import { BadRequestException, Injectable } from '@nestjs/common';
import { AiService } from './ai.service';
import { AiContextService } from './ai-context.service';

export interface AdoptionExplanation {
  overview: string;
  milestones: {
    milestone: string;
    assessment: 'Achieved' | 'Ahead' | 'On pace' | 'Behind' | 'Overdue' | 'Not started';
    explanation: string;
    suggestion: string;
  }[];
  interventions: string[];
  generatedAt: string;
}

const SCHEMA = {
  type: 'object',
  properties: {
    overview: { type: 'string', description: '2-4 sentence plain-language explanation of where adoption stands and why.' },
    milestones: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          milestone: { type: 'string' },
          assessment: { type: 'string', enum: ['Achieved', 'Ahead', 'On pace', 'Behind', 'Overdue', 'Not started'] },
          explanation: { type: 'string', description: 'Why it is in this state, citing the numbers, 1-2 sentences.' },
          suggestion: { type: 'string', description: 'One concrete next step for this milestone.' },
        },
        required: ['milestone', 'assessment', 'explanation', 'suggestion'],
        additionalProperties: false,
      },
    },
    interventions: {
      type: 'array',
      items: { type: 'string' },
      description: '2-4 initiative-wide interventions to lift adoption (training, champions, reinforcement, comms).',
    },
  },
  required: ['overview', 'milestones', 'interventions'],
  additionalProperties: false,
};

const DAY = 86_400_000;

@Injectable()
export class AiAdoptionService {
  constructor(
    private readonly ai: AiService,
    private readonly context: AiContextService,
  ) {}

  async explain(initiativeId: string, organizationId: string): Promise<AdoptionExplanation> {
    const snapshot = await this.context.getSnapshot(initiativeId, organizationId);
    if (!snapshot.adoption.length) throw new BadRequestException('Add adoption milestones to this initiative first.');

    const now = Date.now();
    // Numbers are computed here so the model explains them rather than doing arithmetic.
    const metrics = snapshot.adoption
      .map((a) => {
        const current = a.percentAdopted ?? 0;
        const target = a.targetPercent ?? 100;
        const gap = Math.max(0, target - current);
        const daysLeft = a.targetDate ? Math.round((new Date(a.targetDate).getTime() - now) / DAY) : null;
        const weeklyPace = daysLeft && daysLeft > 0 && gap > 0 ? Math.round((gap / (daysLeft / 7)) * 10) / 10 : null;
        const linked = snapshot.tasks.filter((t) => t.adoptionMilestoneId && String(t.adoptionMilestoneId) === String(a._id));
        const linkedDone = linked.filter((t) => t.status === 'Completed').length;
        const linkedBlocked = linked.filter((t) => t.isBlocked || t.status === 'Blocked').length;
        return [
          `- ${a.milestone}: status ${a.status ?? 'Not Started'}, ${current}% adopted of ${target}% target (gap ${gap} pts)`,
          daysLeft === null
            ? 'no target date'
            : daysLeft < 0
              ? `target date passed ${-daysLeft} days ago`
              : `${daysLeft} days left${weeklyPace !== null ? `, needs ~${weeklyPace} pts/week` : ''}`,
          `linked tasks: ${linked.length} (${linkedDone} completed, ${linkedBlocked} blocked)`,
          a.notes ? `notes: ${a.notes}` : '',
        ]
          .filter(Boolean)
          .join('; ');
      })
      .join('\n');

    const result = await this.ai.completeJson<Omit<AdoptionExplanation, 'generatedAt'>>({
      system: `You are an adoption specialist in NAVI. Explain adoption progress to a change manager in plain language.
Only point-in-time data is available (no history), so judge pace from the gap to target, time left and required weekly pace. A required pace above ~10 points/week is usually unrealistic.
Relate adoption to the linked tasks, open risks, stakeholder resistance and communications when the data supports it. Never invent numbers.`,
      user: `INITIATIVE DATA:\n${this.context.describeSnapshot(snapshot)}\n\nADOPTION METRICS:\n${metrics}\n\nExplain where adoption stands.`,
      schemaName: 'adoption_explanation',
      schema: SCHEMA,
      temperature: 0.3,
    });
    return { ...result, generatedAt: new Date().toISOString() };
  }
}
