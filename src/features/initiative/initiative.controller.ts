import {
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
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

@ApiTags('initiatives')
@Controller('initiatives')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.EMPLOYEE)
@ApiBearerAuth()
export class InitiativeController {
  constructor(private readonly initiativeService: InitiativeService) {}

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
    return this.initiativeService.findAllByOrganization(orgId);
  }

  @Get(':id')
  async getOne(@Param('id') id: string, @CurrentUser() user: Partial<User>) {
    const orgId = this.getOrgId(user);
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
    return this.initiativeService.create(dto, orgId);
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateInitiativeDto,
    @CurrentUser() user: Partial<User>,
  ) {
    const orgId = this.getOrgId(user);
    const updated = await this.initiativeService.update(id, dto, orgId);
    if (!updated) {
      throw new HttpException('Initiative not found.', HttpStatus.NOT_FOUND);
    }
    return updated;
  }
}
