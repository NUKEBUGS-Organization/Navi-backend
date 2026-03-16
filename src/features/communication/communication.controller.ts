import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CommunicationService } from './communication.service';
import { CreateCommunicationDto } from './dto/create-communication.dto';
import { UpdateCommunicationDto } from './dto/update-communication.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User, UserRole } from '../auth/user.entity';

function getOrgId(user: Partial<User>): string | undefined {
  const raw = (user as { organizationId?: { toString: () => string } }).organizationId;
  return raw?.toString?.() ?? (user as { organizationId?: string }).organizationId;
}

@ApiTags('communications')
@Controller('communications')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class CommunicationController {
  constructor(private readonly service: CommunicationService) {}

  @Post()
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  async create(@Body() dto: CreateCommunicationDto, @CurrentUser() user: Partial<User>) {
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
    if (initiativeId) return this.service.findByInitiative(initiativeId, orgId);
    return this.service.findByOrganization(orgId);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateCommunicationDto,
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
    if (!deleted) throw new Error('Communication not found.');
    return { message: 'Communication deleted.' };
  }
}
