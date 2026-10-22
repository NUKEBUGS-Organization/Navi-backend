import { Injectable } from '@nestjs/common';
import { AiService } from './ai.service';
import { AiContextService } from './ai-context.service';
import { DraftCommunicationDto } from './dto/draft-communication.dto';

export interface CommunicationDraft {
  title: string;
  message: string;
}

const DRAFT_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string', description: 'Subject line / title for the communication.' },
    message: { type: 'string', description: 'Full body text, plain text with line breaks.' },
  },
  required: ['title', 'message'],
  additionalProperties: false,
};

const LENGTH_GUIDE: Record<string, string> = {
  Short: 'about 80-120 words',
  Medium: 'about 150-250 words',
  Long: 'about 300-450 words',
};

const SYSTEM_PROMPT = `You are a change-management communications specialist working inside NAVI, a platform that helps organizations roll out change initiatives.
Write clear, human, jargon-free communications that explain what is changing, why it matters to the reader, what they need to do, and where to get help.
Only use facts provided in the initiative context. Never invent dates, names, numbers, or links; if something useful is missing, use a bracketed placeholder like [date] or [link].
Output plain text (no markdown headings or asterisks) in the message body. Do not include a signature block unless asked.`;

@Injectable()
export class AiCommunicationService {
  constructor(
    private readonly ai: AiService,
    private readonly context: AiContextService,
  ) {}

  async draft(dto: DraftCommunicationDto, organizationId: string): Promise<CommunicationDraft> {
    const initiative = await this.context.getInitiative(dto.initiativeId, organizationId);
    const context = this.context.describeInitiative(initiative);

    const request = [
      `Communication type: ${dto.type ?? 'Email'}`,
      `Audience: ${dto.audience || 'All affected employees'}`,
      `Tone: ${dto.tone ?? 'Friendly'}`,
      `Length: ${LENGTH_GUIDE[dto.length ?? 'Medium']}`,
      dto.instructions && `Additional instructions: ${dto.instructions}`,
    ]
      .filter(Boolean)
      .join('\n');

    const task = dto.existingMessage
      ? `Rewrite and improve the existing draft below to fit the request. Keep its key facts.\n\nEXISTING DRAFT:\n${dto.existingMessage}`
      : 'Write a new communication for this request.';

    return this.ai.completeJson<CommunicationDraft>({
      system: SYSTEM_PROMPT,
      user: `INITIATIVE CONTEXT:\n${context}\n\nREQUEST:\n${request}\n\n${task}`,
      schemaName: 'communication_draft',
      schema: DRAFT_SCHEMA,
    });
  }
}
