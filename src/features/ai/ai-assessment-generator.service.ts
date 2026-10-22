import { Injectable } from '@nestjs/common';
import type { NaviPillar } from '../../utils/navi-score';
import { AiService } from './ai.service';
import { AiContextService } from './ai-context.service';
import { GenerateAssessmentDto } from './dto/generate-assessment.dto';

export interface GeneratedStep {
  title: string;
  questions: string[];
  pillars: NaviPillar[];
}

/** Pillar definitions as used in assessment-templates.data.ts. */
const PILLARS: { key: string; letter: NaviPillar; name: string; covers: string }[] = [
  { key: 'navigate', letter: 'N', name: 'Navigate', covers: 'leadership alignment, vision, sponsorship, decision rights' },
  { key: 'activate', letter: 'A', name: 'Activate', covers: 'culture, understanding the why, trust, psychological safety, communication, change fatigue' },
  { key: 'validate', letter: 'V', name: 'Validate', covers: 'execution: resources, systems and tools, manager capability, risks, roadmap, accountability' },
  { key: 'institutionalize', letter: 'I', name: 'Institutionalize', covers: 'success metrics, reinforcement, ownership, performance measures, policies' },
];

const stepSchema = {
  type: 'object',
  properties: {
    title: { type: 'string', description: 'Section focus, 2-4 words, e.g. "Leadership Alignment".' },
    questions: { type: 'array', items: { type: 'string' } },
  },
  required: ['title', 'questions'],
  additionalProperties: false,
};

const SCHEMA = {
  type: 'object',
  properties: Object.fromEntries(PILLARS.map((p) => [p.key, stepSchema])),
  required: PILLARS.map((p) => p.key),
  additionalProperties: false,
};

@Injectable()
export class AiAssessmentGeneratorService {
  constructor(
    private readonly ai: AiService,
    private readonly context: AiContextService,
  ) {}

  async generate(dto: GenerateAssessmentDto, organizationId: string): Promise<{ steps: GeneratedStep[] }> {
    const initiative = dto.initiativeId ? await this.context.getInitiative(dto.initiativeId, organizationId) : null;
    const n = dto.questionsPerPillar;

    const result = await this.ai.completeJson<Record<string, { title: string; questions: string[] }>>({
      system: `You write change-readiness survey items for the NAVI model. Answers use a 1-5 scale (Strongly Disagree to Strongly Agree), so every item must be a single, positively worded statement a respondent can agree or disagree with (not a question), covering one idea only.
Pillars:
${PILLARS.map((p) => `- ${p.letter} = ${p.name}: ${p.covers}`).join('\n')}
Examples of the style: "Leadership has a clearly defined vision for this change." / "Employees feel psychologically safe to express concerns." / "There is a clear implementation roadmap." / "Ownership for sustaining the change is assigned."
For an Employees audience, write from the employee's perspective ("I understand...", "My manager..."). For Leadership, write about the organization and its leaders.
Match the stage: Pre-change = readiness and plans; During change = how it is going now; Post-change = whether the change has stuck.`,
      user: [
        initiative ? `INITIATIVE:\n${this.context.describeInitiative(initiative)}` : 'No specific initiative; keep items general.',
        `Audience: ${dto.audience}`,
        `Stage: ${dto.stage}`,
        `Write exactly ${n} statements per pillar.`,
        dto.focus ? `Emphasize: ${dto.focus}` : '',
      ]
        .filter(Boolean)
        .join('\n'),
      schemaName: 'navi_assessment',
      schema: SCHEMA,
      temperature: 0.6,
      maxTokens: 2500,
    });

    // Pillar tags come from the fixed section order, not from the model.
    const steps = PILLARS.map((p) => {
      const step = result[p.key] ?? { title: p.name, questions: [] };
      const questions = step.questions.map((q) => q.trim()).filter(Boolean).slice(0, n);
      return {
        title: `${p.letter} — ${p.name} ${step.title.trim()}`.trim(),
        questions,
        pillars: questions.map(() => p.letter),
      };
    }).filter((s) => s.questions.length);
    return { steps };
  }
}
