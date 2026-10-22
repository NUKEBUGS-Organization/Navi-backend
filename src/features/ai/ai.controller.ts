import { BadRequestException, Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User, UserRole } from '../auth/user.entity';
import { AiService } from './ai.service';
import { AiCommunicationService } from './ai-communication.service';
import { DraftCommunicationDto } from './dto/draft-communication.dto';

function getOrgId(user: Partial<User>): string | undefined {
  const raw = (user as { organizationId?: { toString: () => string } }).organizationId;
  return raw?.toString?.() ?? (user as { organizationId?: string }).organizationId;
}

@ApiTags('ai')
@Controller('ai')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class AiController {
  constructor(
    private readonly ai: AiService,
    private readonly communications: AiCommunicationService,
  ) {}

  /** Lets the frontend hide AI buttons when no key is configured. */
  @Get('status')
  status() {
    return { enabled: this.ai.isEnabled };
  }

  @Post('communications/draft')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  async draftCommunication(@Body() dto: DraftCommunicationDto, @CurrentUser() user: Partial<User>) {
    const orgId = getOrgId(user);
    if (!orgId) throw new BadRequestException('Not linked to an organization.');
    return this.communications.draft(dto, orgId);
  }
}
