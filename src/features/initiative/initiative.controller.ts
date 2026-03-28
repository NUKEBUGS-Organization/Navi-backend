import {
  Body,
  Controller,
  forwardRef,
  Get,
  HttpException,
  HttpStatus,
  Inject,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { InitiativeService } from './initiative.service';
import { CreateInitiativeDto } from './dto/create-initiative.dto';
import { UpdateInitiativeDto } from './dto/update-initiative.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User, UserRole } from '../auth/user.entity';
import { TaskService } from '../task/task.service';

@ApiTags('initiatives')
@Controller('initiatives')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.EMPLOYEE)
@ApiBearerAuth()
export class InitiativeController {
  constructor(
    private readonly initiativeService: InitiativeService,
    @Inject(forwardRef(() => TaskService))
    private readonly taskService: TaskService,
  ) {}

  private getOrgId(user: Partial<User>): string {
    const orgId = user.organizationId;
    if (!orgId) {
      throw new HttpException(
        'Not linked to an organization.',
        HttpStatus.FORBIDDEN,
      );
    }
    return typeof orgId === 'string' ? orgId : (orgId as { toString: () => string }).toString();
  }

  @Get()
  async list(@CurrentUser() user: Partial<User>) {
    const orgId = this.getOrgId(user);
    await this.taskService.refreshOrganizationInitiativeProgress(orgId);
    return this.initiativeService.findAllByOrganization(orgId);
  }

  @Get('me/participations')
  async myParticipations(@CurrentUser() user: Partial<User>) {
    const orgId = this.getOrgId(user);
    return this.initiativeService.listParticipationsForUser(user, orgId);
  }

  @Get(':id')
  async getOne(@Param('id') id: string, @CurrentUser() user: Partial<User>) {
    const orgId = this.getOrgId(user);
    await this.taskService.refreshInitiativeProgress(id, orgId);
    const initiative = await this.initiativeService.findOne(id, orgId);
    if (!initiative) {
      throw new HttpException('Initiative not found.', HttpStatus.NOT_FOUND);
    }
    return initiative;
  }

  @Post()
  async create(
    @Body() dto: CreateInitiativeDto,
    @CurrentUser() user: Partial<User>,
  ) {
    const orgId = this.getOrgId(user);
    const role = (user as { role?: UserRole }).role;
    // Managers can create initiatives but they always start as WAITING_FOR_APPROVAL until an admin approves.
    const payload: CreateInitiativeDto =
      role === UserRole.MANAGER
        ? ({ ...dto, status: 'WAITING_FOR_APPROVAL' } as CreateInitiativeDto)
        : dto;
    return this.initiativeService.create(payload, orgId);
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateInitiativeDto,
    @CurrentUser() user: Partial<User>,
  ) {
    const orgId = this.getOrgId(user);
    const role = (user as { role?: UserRole }).role;
    const existing = await this.initiativeService.findOne(id, orgId);
    if (!existing) {
      throw new HttpException('Initiative not found.', HttpStatus.NOT_FOUND);
    }

    if (dto.adoptionTrackingEnabled !== undefined) {
      const leadMatch =
        String((existing as { leadName?: string }).leadName ?? '')
          .trim()
          .toLowerCase() === String(user.name ?? '').trim().toLowerCase();
      const canSet =
        role === UserRole.ADMIN || (role === UserRole.MANAGER && leadMatch);
      if (!canSet) {
        throw new HttpException(
          'Only an org admin or this initiative’s change lead can change adoption tracking.',
          HttpStatus.FORBIDDEN,
        );
      }
    }

    // Managers cannot change initiative status; only admins can approve (ACTIVE) or complete (COMPLETED).
    const payload: UpdateInitiativeDto = { ...dto };
    if (role === UserRole.MANAGER) {
      delete (payload as unknown as { status?: unknown }).status;
    }
    const prevAdoption =
      (existing as { adoptionTrackingEnabled?: boolean }).adoptionTrackingEnabled !== false;
    const updated = await this.initiativeService.update(id, payload, orgId);
    if (!updated) {
      throw new HttpException('Initiative not found.', HttpStatus.NOT_FOUND);
    }
    const nextAdoption =
      (updated as { adoptionTrackingEnabled?: boolean }).adoptionTrackingEnabled !== false;
    if (prevAdoption !== nextAdoption) {
      await this.taskService.refreshInitiativeProgress(id, orgId);
    }
    return updated;
  }
}
