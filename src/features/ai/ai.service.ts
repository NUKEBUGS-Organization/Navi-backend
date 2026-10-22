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

export interface ChatTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  run: (args: Record<string, unknown>) => Promise<unknown>;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

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

  /**
   * Runs a conversation where the model may call read-only tools. Each round executes the requested
   * tools and feeds results back, up to maxRounds, then returns the model's final text.
   */
  async chatWithTools(opts: {
    system: string;
    messages: ChatMessage[];
    tools: ChatTool[];
    maxRounds?: number;
  }): Promise<{ reply: string; toolsUsed: string[] }> {
    if (!this.client) throw new ServiceUnavailableException('AI features are not configured.');
    const byName = new Map(opts.tools.map((t) => [t.name, t]));
    const toolsUsed: string[] = [];
    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: 'system', content: opts.system },
      ...opts.messages.map((m) => ({ role: m.role, content: m.content })),
    ];
    const toolDefs: OpenAI.Chat.Completions.ChatCompletionTool[] = opts.tools.map((t) => ({
      type: 'function',
      function: { name: t.name, description: t.description, parameters: t.parameters },
    }));

    try {
      for (let round = 0; round < (opts.maxRounds ?? 5); round++) {
        const completion = await this.client.chat.completions.create({
          model: this.model,
          temperature: 0.3,
          max_completion_tokens: 1200,
          messages,
          tools: toolDefs,
        });
        const msg = completion.choices[0]?.message;
        if (!msg) throw new BadGatewayException('The AI returned an empty response.');
        const calls = (msg.tool_calls ?? []).filter((c) => c.type === 'function');
        if (!calls.length) return { reply: msg.content?.trim() || "I'm not sure how to answer that.", toolsUsed };

        messages.push(msg);
        for (const call of calls) {
          const tool = byName.get(call.function.name);
          let output: unknown;
          try {
            const args = JSON.parse(call.function.arguments || '{}') as Record<string, unknown>;
            output = tool ? await tool.run(args) : { error: `Unknown tool ${call.function.name}` };
            if (tool) toolsUsed.push(tool.name);
          } catch (err) {
            // Report tool failures to the model (e.g. "Initiative not found") instead of failing the chat.
            output = { error: err instanceof Error ? err.message : 'Tool failed' };
          }
          messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(output).slice(0, 12_000) });
        }
      }
      return { reply: 'That needed more steps than I can take in one go. Try asking a narrower question.', toolsUsed };
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
