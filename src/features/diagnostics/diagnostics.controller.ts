import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  PayloadTooLargeException,
  Post,
  Req,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { AuthService } from '../auth/auth.service';
import { DiagnosticsService } from './diagnostics.service';
import { ClientReportRateLimiter } from './rate-limiter';
import { ClientErrorBatchDto } from './dto/client-error.dto';
import type { RecordErrorInput } from './diagnostics.types';

const MAX_BODY_CHARS = 32 * 1024;

@ApiTags('diagnostics')
@Controller('diagnostics')
export class DiagnosticsController {
  constructor(
    private readonly diagnostics: DiagnosticsService,
    private readonly authService: AuthService,
    private readonly jwtService: JwtService,
    private readonly limiter: ClientReportRateLimiter,
  ) {}

  /** Public: browser error reports. Auth is optional and only used to attribute the user. */
  @Post('client-errors')
  @HttpCode(HttpStatus.ACCEPTED)
  async clientErrors(
    @Body() body: ClientErrorBatchDto,
    @Req() req: Request,
  ): Promise<{ accepted: number }> {
    if (JSON.stringify(body).length > MAX_BODY_CHARS) {
      throw new PayloadTooLargeException('Error report payload too large');
    }

    const ip = this.clientIp(req);
    const allowed = this.limiter.allow(ip, body.reports.length);
    if (allowed === 0) return { accepted: 0 };

    const user = await this.resolveUser(req);
    const userAgent = req.headers['user-agent'];

    for (const report of body.reports.slice(0, allowed)) {
      this.diagnostics.record({
        source: 'client',
        severity: 'error',
        kind: report.kind,
        name: report.name,
        message: report.message,
        stack: report.stack,
        componentStack: report.componentStack,
        pageUrl: report.pageUrl,
        appVersion: report.appVersion,
        user,
        userAgent,
        ip,
      });
    }
    return { accepted: allowed };
  }

  private clientIp(req: Request): string {
    const fwd = req.headers['x-forwarded-for'];
    const raw = Array.isArray(fwd) ? fwd[0] : fwd;
    const first = raw?.split(',')[0]?.trim();
    return first || req.ip || 'unknown';
  }

  private async resolveUser(
    req: Request,
  ): Promise<RecordErrorInput['user'] | undefined> {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) return undefined;
    try {
      const payload = this.jwtService.verify<{ sub: string }>(
        header.slice(7).trim(),
      );
      const user = await this.authService.findOne(payload.sub);
      if (!user || user.isActive === false) return undefined;
      const u = user as unknown as {
        _id?: { toString(): string };
        role?: string;
        organizationId?: { toString(): string };
        email?: string;
      };
      return {
        id: u._id?.toString(),
        role: u.role,
        organizationId: u.organizationId?.toString(),
        email: u.email,
      };
    } catch {
      return undefined;
    }
  }
}
