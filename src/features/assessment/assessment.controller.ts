import {
  Body,
  Controller,
  Delete,
  Get,
  HttpException,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AssessmentService } from './assessment.service';
import { CreateAssessmentDto } from './dto/create-assessment.dto';
import { UpdateAssessmentDto } from './dto/update-assessment.dto';
import { SaveAssessmentDraftDto } from './dto/save-assessment-draft.dto';
import { NAVI_ASSESSMENT_TEMPLATES } from './assessment-templates.data';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User, UserRole } from '../auth/user.entity';

function orgIdOf(user: Partial<User>): string {
  const orgId =
    (user as { organizationId?: { toString: () => string } }).organizationId?.toString?.() ??
    (user as { organizationId?: string }).organizationId;
  if (!orgId) throw new HttpException('Not linked to an organization.', HttpStatus.FORBIDDEN);
  return orgId;
}

function userIdOf(user: Partial<User>): string | undefined {
  return (user as { _id?: { toString: () => string } })._id?.toString?.();
}

@ApiTags('assessments')
@Controller('assessments')
export class AssessmentController {
  constructor(private readonly assessmentService: AssessmentService) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @Post()
  async create(
    @Body() dto: CreateAssessmentDto,
    @CurrentUser() user: Partial<User>,
  ) {
    const orgId = (user as { organizationId?: { toString: () => string } })
      .organizationId?.toString?.() ?? (user as { organizationId?: string }).organizationId;
    if (!orgId) {
      throw new HttpException(
        'Not linked to an organization.',
        HttpStatus.FORBIDDEN,
      );
    }
    return this.assessmentService.create(dto, orgId, userIdOf(user));
  }

  // ---- Drafts: saved to the database so work in progress is kept across devices ----
  // (declared before `GET :id` so "drafts" is not treated as an id)

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @Get('drafts')
  listDrafts(@CurrentUser() user: Partial<User>) {
    return this.assessmentService.listDrafts(orgIdOf(user));
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @Post('drafts')
  createDraft(@Body() dto: SaveAssessmentDraftDto, @CurrentUser() user: Partial<User>) {
    return this.assessmentService.saveDraft(dto, orgIdOf(user), userIdOf(user));
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @Get('drafts/:id')
  async getDraft(@Param('id') id: string, @CurrentUser() user: Partial<User>) {
    const draft = await this.assessmentService.findDraft(id, orgIdOf(user));
    if (!draft) throw new HttpException('Draft not found.', HttpStatus.NOT_FOUND);
    return draft;
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @Patch('drafts/:id')
  updateDraft(
    @Param('id') id: string,
    @Body() dto: SaveAssessmentDraftDto,
    @CurrentUser() user: Partial<User>,
  ) {
    return this.assessmentService.saveDraft(dto, orgIdOf(user), userIdOf(user), id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @Post('drafts/:id/publish')
  publishDraft(
    @Param('id') id: string,
    @Body() dto: CreateAssessmentDto,
    @CurrentUser() user: Partial<User>,
  ) {
    return this.assessmentService.publishDraft(id, dto, orgIdOf(user));
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @Delete('drafts/:id')
  deleteDraft(@Param('id') id: string, @CurrentUser() user: Partial<User>) {
    return this.assessmentService.deleteDraft(id, orgIdOf(user));
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Get('templates')
  listTemplates() {
    return NAVI_ASSESSMENT_TEMPLATES;
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Get()
  async listOrGetByInitiative(
    @Query('initiativeId') initiativeId: string,
    @CurrentUser() user: Partial<User>,
  ) {
    const orgId = (user as { organizationId?: { toString: () => string } })
      .organizationId?.toString?.() ?? (user as { organizationId?: string }).organizationId;
    if (!orgId) {
      return [];
    }
    if (initiativeId) {
      return this.assessmentService.findAllByInitiativeId(initiativeId, orgId);
    }
    const userRole = (user as { role?: string }).role;
    return this.assessmentService.findAllByOrganization(orgId, userRole);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Get(':id')
  async getById(
    @Param('id') id: string,
    @CurrentUser() user: Partial<User>,
  ) {
    const orgId = (user as { organizationId?: { toString: () => string } })
      .organizationId?.toString?.() ?? (user as { organizationId?: string }).organizationId;
    if (!orgId) {
      throw new HttpException('Not linked to an organization.', HttpStatus.FORBIDDEN);
    }
    const assessment = await this.assessmentService.findById(id, orgId);
    if (!assessment) {
      throw new HttpException('Assessment not found.', HttpStatus.NOT_FOUND);
    }
    return assessment;
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateAssessmentDto,
    @CurrentUser() user: Partial<User>,
  ) {
    const orgId = (user as { organizationId?: { toString: () => string } })
      .organizationId?.toString?.() ?? (user as { organizationId?: string }).organizationId;
    return this.assessmentService.update(id, {
      completed: dto.completed,
      overallScore: dto.overallScore,
      riskLevel: dto.riskLevel,
    }, orgId);
  }
}
