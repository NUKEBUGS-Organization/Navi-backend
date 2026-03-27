import {
  BadGatewayException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import sgMail from '@sendgrid/mail';

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

  constructor(private readonly config: ConfigService) {
    this.apiKey = (this.config.get<string>('SENDGRID_API_KEY') ?? '').trim() || undefined;
    this.dryRun = (this.config.get<string>('MAIL_DRY_RUN') ?? '').toLowerCase() === 'true';
    if (this.apiKey && !this.dryRun) {
      sgMail.setApiKey(this.apiKey);
    }
  }

  /** True when a real SendGrid call can be made (key present and not dry-run). */
  isLiveSendConfigured(): boolean {
    return Boolean(this.apiKey) && !this.dryRun;
  }

  isDryRun(): boolean {
    return this.dryRun;
  }

  getFromAddress(): string | null {
    const email = (this.config.get<string>('SENDGRID_FROM_EMAIL') ?? '').trim();
    return email || null;
  }

  getStatus() {
    return {
      liveSendConfigured: this.isLiveSendConfigured(),
      dryRun: this.dryRun,
      hasApiKey: Boolean(this.apiKey),
      fromEmailConfigured: Boolean(this.getFromAddress()),
      // Safe to surface: "replace later" test placeholder vs real
      fromEmailPreview: this.getFromAddress() ?? 'not set',
    };
  }

  /**
   * Sends one email via SendGrid.
   * - MAIL_DRY_RUN=true: logs only, no HTTP call.
   * - Missing SENDGRID_API_KEY: throws (unless dry-run).
   * - Use a verified sender as SENDGRID_FROM_EMAIL in the SendGrid dashboard.
   */
  async send(payload: SendMailPayload): Promise<{ messageId?: string; dryRun: boolean }> {
    const fromEmail = this.getFromAddress();
    const fromName = (this.config.get<string>('SENDGRID_FROM_NAME') ?? 'NAVI').trim() || 'NAVI';
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
        'SENDGRID_FROM_EMAIL is not set. Add a verified sender email from SendGrid.',
      );
    }

    if (!this.apiKey) {
      throw new ServiceUnavailableException(
        'SENDGRID_API_KEY is not set. Use a test API key for development and MAIL_DRY_RUN=true to skip sending.',
      );
    }

    const body =
      payload.html != null
        ? { html: payload.html }
        : { text: payload.text ?? '(no body)' };

    try {
      const [res] = await sgMail.send({
        to: payload.to,
        from,
        subject: payload.subject,
        ...body,
      });
      const messageId = res.headers['x-message-id'] as string | undefined;
      this.logger.log(`SendGrid accepted message x-message-id=${messageId ?? 'n/a'} to=${payload.to}`);
      return { messageId, dryRun: false };
    } catch (err: unknown) {
      const sg = err as { response?: { body?: unknown }; message?: string };
      this.logger.error(`SendGrid error: ${sg?.message ?? err}`);
      if (sg?.response?.body != null) {
        this.logger.error(JSON.stringify(sg.response.body));
      }
      throw new BadGatewayException(
        'SendGrid rejected the request. Check API key, sender verification, and recipient.',
      );
    }
  }
}
