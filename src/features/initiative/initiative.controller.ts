import {
  Body,
  Controller,
  Delete,
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
import { Initiative } from './initiative.entity';
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

  /**
   * Drafts are work in progress (the create wizard auto-saves them), so only admins and the
   * person who started the draft can see them. Older drafts without a creator stay admin-only.
   */
  private canSeeInitiative(initiative: Initiative, user: Partial<User>): boolean {
    if ((initiative as { status?: string }).status !== 'DRAFT') return true;
    if ((user as { role?: UserRole }).role === UserRole.ADMIN) return true;
    const creator = (initiative as { createdById?: { toString: () => string } }).createdById?.toString?.();
    const me = (user as { _id?: { toString: () => string } })._id?.toString?.();
    return Boolean(creator && me && creator === me);
  }

  @Get()
  async list(@CurrentUser() user: Partial<User>) {
    const orgId = this.getOrgId(user);
    await this.taskService.refreshOrganizationInitiativeProgress(orgId);
    const all = await this.initiativeService.findAllByOrganization(orgId);
    return all.filter((i) => this.canSeeInitiative(i, user));
  }

  @Get('me/participations')
  async myParticipations(@CurrentUser() user: Partial<User>) {
    const orgId = this.getOrgId(user);
    return this.initiativeService.listParticipationsForUser(user, orgId);
  }

  @Get('raci/rollup')
  async raciRollup(@CurrentUser() user: Partial<User>) {
    const orgId = this.getOrgId(user);
    return this.initiativeService.getRaciRollup(orgId);
  }

  @Get(':id')
  async getOne(@Param('id') id: string, @CurrentUser() user: Partial<User>) {
    const orgId = this.getOrgId(user);
    await this.taskService.refreshInitiativeProgress(id, orgId);
    const initiative = await this.initiativeService.findOne(id, orgId);
    if (!initiative || !this.canSeeInitiative(initiative, user)) {
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
    // Managers can create initiatives but they start as WAITING_FOR_APPROVAL until an admin approves.
    // Exception: a DRAFT (work in progress, e.g. the wizard's autosave) stays a draft until submitted.
    const payload: CreateInitiativeDto =
      role === UserRole.MANAGER && dto.status !== 'DRAFT'
        ? ({ ...dto, status: 'WAITING_FOR_APPROVAL' } as CreateInitiativeDto)
        : dto;
    const userId = (user as { _id?: { toString: () => string } })._id?.toString?.();
    return this.initiativeService.create(payload, orgId, userId);
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
    if (!existing || !this.canSeeInitiative(existing, user)) {
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
    // Managers may only submit their own draft for approval (DRAFT -> WAITING_FOR_APPROVAL).
    const payload: UpdateInitiativeDto = { ...dto };
    if (role === UserRole.MANAGER) {
      const submittingDraft =
        (existing as { status?: string }).status === 'DRAFT' &&
        (dto.status === 'DRAFT' || dto.status === 'WAITING_FOR_APPROVAL');
      if (!submittingDraft) {
        delete (payload as unknown as { status?: unknown }).status;
      }
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

  /**
   * Discard an unpublished draft (e.g. one the create wizard auto-saved). Only DRAFT initiatives
   * with no roadmap tasks can be deleted, so nothing that is in use can be lost.
   */
  @Delete(':id/draft')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  async deleteDraft(@Param('id') id: string, @CurrentUser() user: Partial<User>) {
    const orgId = this.getOrgId(user);
    const existing = await this.initiativeService.findOne(id, orgId);
    if (!existing || !this.canSeeInitiative(existing, user)) {
      throw new HttpException('Initiative not found.', HttpStatus.NOT_FOUND);
    }
    if ((existing as { status?: string }).status !== 'DRAFT') {
      throw new HttpException('Only draft initiatives can be discarded.', HttpStatus.BAD_REQUEST);
    }
    const tasks = await this.taskService.findByInitiative(id, orgId);
    if (tasks.length > 0) {
      throw new HttpException(
        'This draft already has roadmap tasks, so it cannot be discarded.',
        HttpStatus.BAD_REQUEST,
      );
    }
    await this.initiativeService.deleteDraft(id, orgId);
    return { deleted: true };
  }
}
