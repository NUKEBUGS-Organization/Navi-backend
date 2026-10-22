import { Injectable } from '@nestjs/common';
import { AiService } from './ai.service';
import { DraftInitiativeDto } from './dto/draft-initiative.dto';

const CHANGE_TYPES = [
  'Tech/Digital',
  'ERP system change',
  'Cultural transformation',
  'Department restructuring',
  'Full company restructuring',
  'Merger/acquisition',
  'Other',
];

export interface InitiativeDraft {
  title: string;
  description: string;
  changeType: string;
  goals: { goal: string; metric: string }[];
  faqs: { question: string; answer: string }[];
  departments: string[];
  wholeOrganization: boolean;
  hseImpact: boolean;
  foodSafetyImpact: boolean;
  durationWeeks: number;
}

const SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string', description: 'Concise initiative title, max ~8 words.' },
    description: { type: 'string', description: 'Purpose and desired outcome, 2-4 sentences.' },
    changeType: { type: 'string', enum: CHANGE_TYPES },
    goals: {
      type: 'array',
      description: '3-4 measurable goals.',
      items: {
        type: 'object',
        properties: {
          goal: { type: 'string' },
          metric: { type: 'string', description: 'Short measurable target, e.g. "90% completion".' },
        },
        required: ['goal', 'metric'],
        additionalProperties: false,
      },
    },
    faqs: {
      type: 'array',
      description: '4-6 questions employees are likely to ask, with clear answers. Use [placeholders] for unknown facts.',
      items: {
        type: 'object',
        properties: { question: { type: 'string' }, answer: { type: 'string' } },
        required: ['question', 'answer'],
        additionalProperties: false,
      },
    },
    departments: {
      type: 'array',
      items: { type: 'string' },
      description: 'Affected departments, chosen ONLY from the provided list. Empty if the whole organization is affected.',
    },
    wholeOrganization: { type: 'boolean' },
    hseImpact: { type: 'boolean', description: 'True if the change affects health & safety.' },
    foodSafetyImpact: { type: 'boolean', description: 'True if the change affects food safety.' },
    durationWeeks: { type: 'integer', description: 'Realistic duration in weeks (4-104).' },
  },
  required: [
    'title',
    'description',
    'changeType',
    'goals',
    'faqs',
    'departments',
    'wholeOrganization',
    'hseImpact',
    'foodSafetyImpact',
    'durationWeeks',
  ],
  additionalProperties: false,
};

@Injectable()
export class AiInitiativeDraftService {
  constructor(private readonly ai: AiService) {}

  async draft(dto: DraftInitiativeDto): Promise<InitiativeDraft> {
    const departments = [...new Set((dto.departments ?? []).map((d) => d.trim()).filter(Boolean))];
    const result = await this.ai.completeJson<InitiativeDraft>({
      system: `You are a change-management consultant helping set up a new initiative in NAVI from a short idea.
Produce a practical, specific setup. Goals must be measurable. FAQs should answer what employees will really ask (why, what changes for me, when, training, who to ask).
Do not invent names, dates or numbers that the idea does not imply; use [placeholders] instead.`,
      user: `IDEA:\n${dto.idea}\n\nAVAILABLE DEPARTMENTS: ${departments.length ? departments.join(', ') : '(none listed)'}`,
      schemaName: 'initiative_draft',
      schema: SCHEMA,
      temperature: 0.5,
    });

    // Keep only departments that really exist, and clamp the duration.
    const allowed = new Set(departments);
    const picked = result.departments.filter((d) => allowed.has(d));
    return {
      ...result,
      departments: picked,
      wholeOrganization: result.wholeOrganization || picked.length === 0,
      durationWeeks: Math.min(104, Math.max(4, Math.round(result.durationWeeks || 12))),
    };
  }
}
