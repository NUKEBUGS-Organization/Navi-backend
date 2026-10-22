import { Injectable } from '@nestjs/common';
import { AiService } from './ai.service';
import { AiContextService } from './ai-context.service';
import { AssessRiskDto } from './dto/assess-risk.dto';

export type Severity = 'Low' | 'Medium' | 'High' | 'Critical';

export interface RiskSuggestion {
  title: string;
  description: string;
  severity: Severity;
  mitigationNotes: string;
  rationale: string;
}

export interface RiskAssessment {
  severity: Severity;
  rationale: string;
  mitigationNotes: string;
}

const SEVERITY = { type: 'string', enum: ['Low', 'Medium', 'High', 'Critical'] };

const SUGGEST_SCHEMA = {
  type: 'object',
  properties: {
    risks: {
      type: 'array',
      description: '3-6 new risks, most important first.',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Short risk title, max ~10 words.' },
          description: { type: 'string', description: 'What could go wrong and its impact, 1-2 sentences.' },
          severity: SEVERITY,
          mitigationNotes: { type: 'string', description: '2-3 concrete mitigation steps in one short paragraph.' },
          rationale: { type: 'string', description: 'Why this risk applies to this initiative, citing the data.' },
        },
        required: ['title', 'description', 'severity', 'mitigationNotes', 'rationale'],
        additionalProperties: false,
      },
    },
  },
  required: ['risks'],
  additionalProperties: false,
};

const ASSESS_SCHEMA = {
  type: 'object',
  properties: {
    severity: SEVERITY,
    rationale: { type: 'string', description: 'Why this severity, 1-2 sentences.' },
    mitigationNotes: { type: 'string', description: '2-4 concrete mitigation steps in one short paragraph.' },
  },
  required: ['severity', 'rationale', 'mitigationNotes'],
  additionalProperties: false,
};

const SEVERITY_GUIDE = `Severity guide: Low = minor, easily absorbed; Medium = noticeable delay or resistance; High = threatens a goal, timeline or adoption target; Critical = could cause the initiative to fail or cause safety/compliance harm.`;

@Injectable()
export class AiRiskService {
  constructor(
    private readonly ai: AiService,
    private readonly context: AiContextService,
  ) {}

  async suggest(initiativeId: string, organizationId: string): Promise<{ risks: RiskSuggestion[] }> {
    const snapshot = await this.context.getSnapshot(initiativeId, organizationId);
    const flags = [
      snapshot.initiative.hseImpact && 'This initiative has health & safety (HSE) impact.',
      snapshot.initiative.foodSafetyImpact && 'This initiative has food safety impact.',
    ]
      .filter(Boolean)
      .join(' ');

    return this.ai.completeJson<{ risks: RiskSuggestion[] }>({
      system: `You are a change-management risk analyst in NAVI. Identify realistic change risks (people, adoption, resistance, capacity, communication, timeline, dependencies, compliance) for an initiative.
Base every risk on the initiative data. Do NOT repeat risks that are already listed. ${SEVERITY_GUIDE}`,
      user: `INITIATIVE DATA:\n${this.context.describeSnapshot(snapshot)}\n${flags}\n\nSuggest new risks not already covered.`,
      schemaName: 'risk_suggestions',
      schema: SUGGEST_SCHEMA,
      temperature: 0.5,
    });
  }

  async assess(dto: AssessRiskDto, organizationId: string): Promise<RiskAssessment> {
    const initiative = await this.context.getInitiative(dto.initiativeId, organizationId);
    return this.ai.completeJson<RiskAssessment>({
      system: `You are a change-management risk analyst in NAVI. Rate the severity of a single risk and propose mitigation. ${SEVERITY_GUIDE} Be concrete and practical.`,
      user: `INITIATIVE:\n${this.context.describeInitiative(initiative)}\n\nRISK:\nTitle: ${dto.title}\n${dto.description ? `Description: ${dto.description}` : ''}`,
      schemaName: 'risk_assessment',
      schema: ASSESS_SCHEMA,
      temperature: 0.2,
    });
  }
}
