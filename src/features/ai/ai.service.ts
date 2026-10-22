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
const DEFAULT_EMBEDDING_MODEL = 'text-embedding-3-small';
const DEFAULT_RATE_LIMIT_PER_HOUR = 60;

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
  readonly embeddingModel: string;
  private readonly rateLimitPerHour: number;
  /** userId -> request timestamps (ms) within the last hour. In-memory, so per server instance. */
  private readonly recentRequests = new Map<string, number[]>();

  constructor(config: ConfigService) {
    const apiKey = config.get<string>('OPENAI_API_KEY');
    this.client = apiKey ? new OpenAI({ apiKey, timeout: 60_000, maxRetries: 2 }) : null;
    this.model = config.get<string>('OPENAI_MODEL') ?? DEFAULT_MODEL;
    this.embeddingModel = config.get<string>('OPENAI_EMBEDDING_MODEL') ?? DEFAULT_EMBEDDING_MODEL;
    this.rateLimitPerHour =
      parseInt(config.get<string>('AI_RATE_LIMIT_PER_HOUR') ?? '', 10) || DEFAULT_RATE_LIMIT_PER_HOUR;
    if (!this.client) this.logger.warn('OPENAI_API_KEY is not set; AI features are disabled.');
  }

  get isEnabled(): boolean {
    return this.client !== null;
  }

  /** Throws 429 when a user exceeds AI_RATE_LIMIT_PER_HOUR requests in a rolling hour. */
  checkRateLimit(userId: string): void {
    const now = Date.now();
    const recent = (this.recentRequests.get(userId) ?? []).filter((t) => now - t < 3_600_000);
    if (recent.length >= this.rateLimitPerHour) {
      throw new HttpException(
        'You have reached the hourly limit for AI requests. Please try again later.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    recent.push(now);
    this.recentRequests.set(userId, recent);
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (!this.client) throw new ServiceUnavailableException('AI features are not configured.');
    if (!texts.length) return [];
    try {
      const res = await this.client.embeddings.create({ model: this.embeddingModel, input: texts });
      return res.data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
    } catch (err) {
      throw this.toHttpError(err);
    }
  }

  private toHttpError(err: unknown): unknown {
    if (err instanceof OpenAI.RateLimitError) {
      return new HttpException('AI is busy right now. Please try again shortly.', HttpStatus.TOO_MANY_REQUESTS);
    }
    if (err instanceof OpenAI.APIError) {
      this.logger.error(`OpenAI error ${err.status}: ${err.message}`);
      return new BadGatewayException('AI request failed.');
    }
    return err;
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
      throw this.toHttpError(err);
    }
  }
}
