import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AdoptionService } from './adoption.service';
import { CreateAdoptionDto } from './dto/create-adoption.dto';
import { UpdateAdoptionDto } from './dto/update-adoption.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User, UserRole } from '../auth/user.entity';

function getOrgId(user: Partial<User>): string | undefined {
  const raw = (user as { organizationId?: { toString: () => string } }).organizationId;
  return raw?.toString?.() ?? (user as { organizationId?: string }).organizationId;
}

@ApiTags('adoption')
@Controller('adoption')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class AdoptionController {
  constructor(private readonly service: AdoptionService) {}

  @Post()
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  async create(@Body() dto: CreateAdoptionDto, @CurrentUser() user: Partial<User>) {
    const orgId = getOrgId(user);
    if (!orgId) throw new Error('Not linked to an organization.');
    return this.service.create(dto, orgId);
  }

  @Get()
  async list(
    @Query('initiativeId') initiativeId: string,
    @CurrentUser() user: Partial<User>,
  ) {
    const orgId = getOrgId(user);
    if (!orgId) return [];
    const role = (user as { role?: UserRole }).role;
    if (initiativeId) return this.service.findByInitiative(initiativeId, orgId, role);
    if (role === UserRole.EMPLOYEE) return [];
    return this.service.findByOrganization(orgId);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateAdoptionDto,
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
    if (!deleted) throw new Error('Adoption milestone not found.');
    return { message: 'Adoption milestone deleted.' };
  }
}
