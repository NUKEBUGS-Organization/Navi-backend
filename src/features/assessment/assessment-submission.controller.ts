import { Body, Controller, Get, HttpException, HttpStatus, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AssessmentSubmissionService } from './assessment-submission.service';
import { CreateSubmissionDto } from './dto/create-submission.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User } from '../auth/user.entity';

function getOrgId(user: Partial<User>): string | undefined {
  const raw = (user as { organizationId?: { toString: () => string } }).organizationId;
  return raw?.toString?.() ?? (user as { organizationId?: string }).organizationId;
}

function getUserId(user: Partial<User>): string | undefined {
  const raw = (user as { _id?: { toString: () => string } })._id;
  return raw?.toString?.() ?? (user as { _id?: string })._id;
}

@ApiTags('assessment-submissions')
@Controller('assessment-submissions')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class AssessmentSubmissionController {
  constructor(private readonly submissionService: AssessmentSubmissionService) {}

  @Post()
  async create(
    @Body() dto: CreateSubmissionDto,
    @CurrentUser() user: Partial<User>,
  ) {
    const orgId = getOrgId(user);
    const userId = getUserId(user);
    if (!orgId || !userId) {
      throw new HttpException('Not linked to an organization or user.', HttpStatus.FORBIDDEN);
    }
    return this.submissionService.create(
      dto.assessmentId,
      userId,
      orgId,
      dto.overallScore,
      dto.riskLevel,
      dto.answers,
    );
  }

  @Get('navi-summary')
  async naviSummary(@CurrentUser() user: Partial<User>) {
    const orgId = getOrgId(user);
    if (!orgId) return null;
    return this.submissionService.getNaviAggregate(orgId);
  }

  @Get()
  async list(
    @Query('mine') mine: string,
    @Query('initiativeId') initiativeId: string,
    @CurrentUser() user: Partial<User>,
  ) {
    const orgId = getOrgId(user);
    const userId = getUserId(user);
    if (!orgId) {
      return [];
    }
    if (initiativeId) {
      return this.submissionService.findByInitiativeId(initiativeId);
    }
    if (mine === 'true' && userId) {
      return this.submissionService.findByUser(orgId, userId);
    }
    return this.submissionService.findByOrganization(orgId);
  }
}
