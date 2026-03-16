import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RiskService } from './risk.service';
import { CreateRiskDto } from './dto/create-risk.dto';
import { UpdateRiskDto } from './dto/update-risk.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User, UserRole } from '../auth/user.entity';

function getOrgId(user: Partial<User>): string | undefined {
  const raw = (user as { organizationId?: { toString: () => string } }).organizationId;
  return raw?.toString?.() ?? (user as { organizationId?: string }).organizationId;
}

@ApiTags('risks')
@Controller('risks')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class RiskController {
  constructor(private readonly service: RiskService) {}

  @Post()
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  async create(@Body() dto: CreateRiskDto, @CurrentUser() user: Partial<User>) {
    const orgId = getOrgId(user);
    if (!orgId) throw new Error('Not linked to an organization.');
    return this.service.create(dto, orgId);
  }

  @Get('summary')
  async summary(@CurrentUser() user: Partial<User>) {
    const orgId = getOrgId(user);
    if (!orgId) return { high: 0, critical: 0, open: 0 };
    return this.service.countBySeverity(orgId);
  }

  @Get()
  async list(
    @Query('initiativeId') initiativeId: string,
    @Query('status') status: string,
    @Query('severity') severity: string,
    @CurrentUser() user: Partial<User>,
  ) {
    const orgId = getOrgId(user);
    if (!orgId) return [];
    if (initiativeId) return this.service.findByInitiative(initiativeId, orgId);
    return this.service.findByOrganization(orgId, status || undefined, severity || undefined);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateRiskDto,
    @CurrentUser() user: Partial<User>,
  ) {
    const orgId = getOrgId(user);
    if (!orgId) throw new Error('Not linked to an organization.');
    return this.service.update(id, dto, orgId);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  async delete(@Param('id') id: string, @CurrentUser() user: Partial<User>) {
    const orgId = getOrgId(user);
    if (!orgId) throw new Error('Not linked to an organization.');
    const deleted = await this.service.delete(id, orgId);
    if (!deleted) throw new Error('Risk not found.');
    return { message: 'Risk deleted.' };
  }
}
