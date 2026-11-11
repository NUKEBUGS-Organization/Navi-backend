import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  PayloadTooLargeException,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { AuthService } from '../auth/auth.service';
import { DiagnosticsService } from './diagnostics.service';
import { ClientReportRateLimiter } from './rate-limiter';
import { ClientErrorBatchDto } from './dto/client-error.dto';
import type { ErrorGroupView, RecordErrorInput } from './diagnostics.types';
import { ListGroupsQueryDto } from './dto/list-groups.dto';
import { UpdateGroupDto } from './dto/update-group.dto';
import { ErrorEvent } from './error-event.entity';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User, UserRole } from '../auth/user.entity';

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

    // req.ip honours 'trust proxy' (TRUST_PROXY_HOPS), so a client cannot spoof it.
    const ip = req.ip || 'unknown';
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
        route: report.route,
        appVersion: report.appVersion,
        user,
        userAgent,
        ip,
      });
    }
    return { accepted: allowed };
  }

  @Get('summary')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  @ApiBearerAuth()
  getSummary() {
    return this.diagnostics.getSummary();
  }

  @Get('groups')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  @ApiBearerAuth()
  listGroups(@Query() query: ListGroupsQueryDto) {
    return this.diagnostics.listGroups(query);
  }

  @Get('groups/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  @ApiBearerAuth()
  getGroup(
    @Param('id') id: string,
  ): Promise<{ group: ErrorGroupView; events: ErrorEvent[] }> {
    return this.diagnostics.getGroup(id);
  }

  @Patch('groups/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  @ApiBearerAuth()
  updateGroup(
    @Param('id') id: string,
    @Body() dto: UpdateGroupDto,
    @CurrentUser() user: Partial<User>,
  ): Promise<ErrorGroupView> {
    return this.diagnostics.setStatus(id, dto.status, String(user._id));
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
