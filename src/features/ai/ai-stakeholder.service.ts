import { BadRequestException, Injectable } from '@nestjs/common';
import { AiService } from './ai.service';
import { AiContextService } from './ai-context.service';

export interface StakeholderPlan {
  name: string;
  quadrant: 'Manage closely' | 'Keep satisfied' | 'Keep informed' | 'Monitor';
  strategy: string;
  frequency: string;
  channel: string;
  keyMessage: string;
}

export interface StakeholderAnalysis {
  overview: string;
  concerns: string[];
  stakeholders: StakeholderPlan[];
  generatedAt: string;
}

const SCHEMA = {
  type: 'object',
  properties: {
    overview: { type: 'string', description: '2-4 sentences on the overall stakeholder landscape.' },
    concerns: {
      type: 'array',
      items: { type: 'string' },
      description: 'Key stakeholder risks, e.g. influential resisters, missing sponsor coverage (0-4).',
    },
    stakeholders: {
      type: 'array',
      description: 'One entry per stakeholder in the data, most critical first.',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          quadrant: { type: 'string', enum: ['Manage closely', 'Keep satisfied', 'Keep informed', 'Monitor'] },
          strategy: { type: 'string', description: 'How to engage this person, 1-2 sentences.' },
          frequency: { type: 'string', description: 'e.g. Weekly, Bi-weekly, Monthly.' },
          channel: { type: 'string', description: 'e.g. 1:1 meeting, steering committee, email update.' },
          keyMessage: { type: 'string', description: 'The main message to land with them, one sentence.' },
        },
        required: ['name', 'quadrant', 'strategy', 'frequency', 'channel', 'keyMessage'],
        additionalProperties: false,
      },
    },
  },
  required: ['overview', 'concerns', 'stakeholders'],
  additionalProperties: false,
};

@Injectable()
export class AiStakeholderService {
  constructor(
    private readonly ai: AiService,
    private readonly context: AiContextService,
  ) {}

  async analyze(initiativeId: string, organizationId: string): Promise<StakeholderAnalysis> {
    const snapshot = await this.context.getSnapshot(initiativeId, organizationId);
    if (!snapshot.stakeholders.length) {
      throw new BadRequestException('Add stakeholders to this initiative first.');
    }
    const detail = snapshot.stakeholders
      .map(
        (s) =>
          `- ${s.name}${s.role ? ` (${s.role})` : ''}: influence ${s.influence ?? 'unknown'}, support ${s.support ?? 'unknown'}${s.notes ? `; notes: ${s.notes}` : ''}`,
      )
      .join('\n');

    const result = await this.ai.completeJson<Omit<StakeholderAnalysis, 'generatedAt'>>({
      system: `You are a change-management stakeholder strategist in NAVI. Use the influence/support grid:
High influence + Resistant/Neutral = "Manage closely"; High influence + Supporter/Champion = "Keep satisfied" (use as sponsors/advocates); Low/Medium influence + Resistant = "Keep informed" with targeted engagement; Low influence + Supporter/Neutral = "Monitor" or "Keep informed".
Tailor each strategy to the person's role and notes and to this initiative. Turn champions into advocates; address resisters' likely concerns. Never invent stakeholders.`,
      user: `INITIATIVE DATA:\n${this.context.describeSnapshot(snapshot)}\n\nSTAKEHOLDER DETAIL:\n${detail}\n\nCreate an engagement plan.`,
      schemaName: 'stakeholder_analysis',
      schema: SCHEMA,
      temperature: 0.4,
    });
    return { ...result, generatedAt: new Date().toISOString() };
  }
}
