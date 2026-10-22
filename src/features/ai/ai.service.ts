import {
  BadGatewayException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

const DEFAULT_MODEL = 'gpt-4o-mini';

export interface JsonCompletionOptions {
  system: string;
  user: string;
  /** Name + JSON schema the model's answer must follow (OpenAI structured outputs). */
  schemaName: string;
  schema: Record<string, unknown>;
  temperature?: number;
  maxTokens?: number;
}

/** Thin wrapper around the OpenAI SDK. Feature modules call this instead of using OpenAI directly. */
@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly client: OpenAI | null;
  private readonly model: string;

  constructor(config: ConfigService) {
    const apiKey = config.get<string>('OPENAI_API_KEY');
    this.client = apiKey ? new OpenAI({ apiKey, timeout: 60_000, maxRetries: 2 }) : null;
    this.model = config.get<string>('OPENAI_MODEL') ?? DEFAULT_MODEL;
    if (!this.client) this.logger.warn('OPENAI_API_KEY is not set; AI features are disabled.');
  }

  get isEnabled(): boolean {
    return this.client !== null;
  }

  async completeJson<T>(opts: JsonCompletionOptions): Promise<T> {
    if (!this.client) throw new ServiceUnavailableException('AI features are not configured.');

    try {
      const completion = await this.client.chat.completions.create({
        model: this.model,
        temperature: opts.temperature ?? 0.7,
        max_completion_tokens: opts.maxTokens ?? 1500,
        messages: [
          { role: 'system', content: opts.system },
          { role: 'user', content: opts.user },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: { name: opts.schemaName, strict: true, schema: opts.schema },
        },
      });

      const choice = completion.choices[0];
      if (choice?.message?.refusal) throw new BadGatewayException('The AI declined this request.');
      const content = choice?.message?.content;
      if (!content) throw new BadGatewayException('The AI returned an empty response.');

      if (completion.usage) {
        this.logger.log(
          `${opts.schemaName}: ${completion.usage.prompt_tokens} in / ${completion.usage.completion_tokens} out tokens`,
        );
      }
      return JSON.parse(content) as T;
    } catch (err) {
      if (err instanceof OpenAI.RateLimitError) {
        throw new HttpException('AI is busy right now. Please try again shortly.', HttpStatus.TOO_MANY_REQUESTS);
      }
      if (err instanceof OpenAI.APIError) {
        this.logger.error(`OpenAI error ${err.status}: ${err.message}`);
        throw new BadGatewayException('AI request failed.');
      }
      throw err;
    }
  }
}
