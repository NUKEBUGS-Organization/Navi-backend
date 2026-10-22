import { Injectable } from '@nestjs/common';
import { AiService } from './ai.service';
import { AiContextService } from './ai-context.service';

export type HealthStatus = 'On Track' | 'At Risk' | 'Off Track';

export interface InitiativeHealthSummary {
  status: HealthStatus;
  headline: string;
  summary: string;
  highlights: string[];
  concerns: string[];
  nextActions: { action: string; priority: 'High' | 'Medium' | 'Low'; area: string }[];
  generatedAt: string;
}

const HEALTH_SCHEMA = {
  type: 'object',
  properties: {
    status: { type: 'string', enum: ['On Track', 'At Risk', 'Off Track'] },
    headline: { type: 'string', description: 'One sentence verdict, max ~20 words.' },
    summary: { type: 'string', description: 'Executive summary paragraph, 3-5 sentences.' },
    highlights: { type: 'array', items: { type: 'string' }, description: 'What is going well (0-4 items).' },
    concerns: { type: 'array', items: { type: 'string' }, description: 'Main problems or warning signs (0-5 items).' },
    nextActions: {
      type: 'array',
      description: 'The 3 most important next steps.',
      items: {
        type: 'object',
        properties: {
          action: { type: 'string' },
          priority: { type: 'string', enum: ['High', 'Medium', 'Low'] },
          area: {
            type: 'string',
            enum: ['Tasks', 'Risks', 'Adoption', 'Stakeholders', 'Communications', 'General'],
          },
        },
        required: ['action', 'priority', 'area'],
        additionalProperties: false,
      },
    },
  },
  required: ['status', 'headline', 'summary', 'highlights', 'concerns', 'nextActions'],
  additionalProperties: false,
};

const SYSTEM_PROMPT = `You are a senior change-management advisor reviewing an initiative in NAVI.
Assess its health from the data provided: task progress and overdue/blocked work, open risks by severity, adoption against targets, stakeholder support, and communications.
Be specific and cite concrete items (task, risk, milestone or stakeholder names, numbers) from the data. Never invent facts.
If data is sparse (e.g. no tasks or no adoption milestones), say so as a concern rather than guessing.
Status guide: "On Track" = progressing with no serious issues; "At Risk" = notable issues that need attention soon; "Off Track" = critical risks, significant overdue work, or adoption far below target.
Write for a busy executive: plain language, no jargon.`;

@Injectable()
export class AiInitiativeHealthService {
  constructor(
    private readonly ai: AiService,
    private readonly context: AiContextService,
  ) {}

  async summarize(initiativeId: string, organizationId: string): Promise<InitiativeHealthSummary> {
    const snapshot = await this.context.getSnapshot(initiativeId, organizationId);
    const result = await this.ai.completeJson<Omit<InitiativeHealthSummary, 'generatedAt'>>({
      system: SYSTEM_PROMPT,
      user: `INITIATIVE DATA:\n${this.context.describeSnapshot(snapshot)}\n\nAssess this initiative's health.`,
      schemaName: 'initiative_health',
      schema: HEALTH_SCHEMA,
      temperature: 0.3,
    });
    return { ...result, generatedAt: new Date().toISOString() };
  }
}
