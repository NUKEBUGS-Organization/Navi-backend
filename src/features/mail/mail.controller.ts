import { Body, Controller, Get, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../auth/user.entity';
import { MailService } from './mail.service';
import { SendTestMailDto } from './dto/send-test-mail.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User } from '../auth/user.entity';

@ApiTags('mail')
@Controller('mail')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class MailController {
  constructor(private readonly mail: MailService) {}

  @Get('status')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Resend mail configuration status (safe for test environments)',
    description:
      'Shows whether API key / from address are set and if MAIL_DRY_RUN is on. Does not expose secrets.',
  })
  status() {
    return this.mail.getStatus();
  }

  @Post('test-send')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Send a one-off test email via Resend',
    description:
      'Requires RESEND_API_KEY and RESEND_FROM_EMAIL unless MAIL_DRY_RUN=true (logs only).',
  })
  async testSend(@Body() dto: SendTestMailDto, @CurrentUser() user: Partial<User>) {
    const subject = dto.subject?.trim() || 'NAVI — Resend test email';
    const text =
      `This is a test message from the NAVI backend.\n\n` +
      `Time (UTC): ${new Date().toISOString()}\n` +
      `Triggered by: ${user.email ?? user._id ?? 'unknown'}\n\n` +
      `Configure RESEND_API_KEY and RESEND_FROM_EMAIL in .env for production.`;

    const result = await this.mail.send({
      to: dto.to,
      subject,
      text,
    });

    return {
      ok: true,
      dryRun: result.dryRun,
      messageId: result.messageId,
      message: result.dryRun
        ? 'MAIL_DRY_RUN is enabled — nothing was sent to Resend.'
        : 'Resend accepted the message (delivery still depends on provider / spam filters).',
    };
  }
}
