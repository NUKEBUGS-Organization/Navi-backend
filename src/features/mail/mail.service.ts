import {
  BadGatewayException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

export type SendMailPayload = {
  to: string;
  subject: string;
  text?: string;
  html?: string;
};

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly apiKey: string | undefined;
  private readonly dryRun: boolean;
  private resend: Resend | null = null;

  constructor(private readonly config: ConfigService) {
    this.apiKey = (this.config.get<string>('RESEND_API_KEY') ?? '').trim() || undefined;
    this.dryRun = (this.config.get<string>('MAIL_DRY_RUN') ?? '').toLowerCase() === 'true';
    if (this.apiKey && !this.dryRun) {
      this.resend = new Resend(this.apiKey);
    }
  }

  /** True when a real Resend call can be made (key present and not dry-run). */
  isLiveSendConfigured(): boolean {
    return Boolean(this.apiKey) && !this.dryRun;
  }

  isDryRun(): boolean {
    return this.dryRun;
  }

  getFromAddress(): string | null {
    const email = (this.config.get<string>('RESEND_FROM_EMAIL') ?? '').trim();
    return email || null;
  }

  getStatus() {
    return {
      liveSendConfigured: this.isLiveSendConfigured(),
      dryRun: this.dryRun,
      hasApiKey: Boolean(this.apiKey),
      fromEmailConfigured: Boolean(this.getFromAddress()),
      fromEmailPreview: this.getFromAddress() ?? 'not set',
      provider: 'resend',
    };
  }

  /**
   * Sends one email via Resend.
   * - MAIL_DRY_RUN=true: logs only, no HTTP call.
   * - Missing RESEND_API_KEY: throws (unless dry-run).
   * - RESEND_FROM_EMAIL must be a domain you verified in Resend (or Resend onboarding address for testing).
   */
  async send(payload: SendMailPayload): Promise<{ messageId?: string; dryRun: boolean }> {
    const fromEmail = this.getFromAddress();
    const fromName = (this.config.get<string>('RESEND_FROM_NAME') ?? 'NAVI').trim() || 'NAVI';
    const from = fromEmail ? `${fromName} <${fromEmail}>` : `${fromName} <not-configured@localhost>`;

    if (this.dryRun) {
      this.logger.log(
        `[MAIL_DRY_RUN] To=${payload.to} From=${from} Subject=${payload.subject} ` +
          `(body omitted; ${payload.text ? 'text' : payload.html ? 'html' : 'empty'})`,
      );
      return { dryRun: true };
    }

    if (!fromEmail) {
      throw new ServiceUnavailableException(
        'RESEND_FROM_EMAIL is not set. Use an address from a domain verified in Resend.',
      );
    }

    if (!this.apiKey || !this.resend) {
      throw new ServiceUnavailableException(
        'RESEND_API_KEY is not set. Add your key to .env or set MAIL_DRY_RUN=true for local testing.',
      );
    }

    const html = payload.html ?? undefined;
    const text = payload.html == null ? (payload.text ?? '(no body)') : undefined;

    try {
      const { data, error } = await this.resend.emails.send({
        from,
        to: payload.to,
        subject: payload.subject,
        ...(html != null ? { html } : { text: text ?? '(no body)' }),
      });

      if (error) {
        this.logger.error(`Resend error: ${JSON.stringify(error)}`);
        throw new BadGatewayException(
          'Resend rejected the request. Check API key, verified domain, and recipient.',
        );
      }

      const messageId = data?.id;
      this.logger.log(`Resend accepted email id=${messageId ?? 'n/a'} to=${payload.to}`);
      return { messageId, dryRun: false };
    } catch (err: unknown) {
      if (err instanceof BadGatewayException || err instanceof ServiceUnavailableException) throw err;
      this.logger.error(`Resend error: ${err instanceof Error ? err.message : err}`);
      throw new BadGatewayException(
        'Resend rejected the request. Check API key, verified domain, and recipient.',
      );
    }
  }
}
