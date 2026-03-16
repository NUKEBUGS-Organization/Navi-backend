import {
  Body,
  Controller,
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
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User, UserRole } from '../auth/user.entity';

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
    return this.assessmentService.create(dto, orgId);
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
