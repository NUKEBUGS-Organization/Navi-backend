import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { NotFoundException } from '@nestjs/common';
import { OrganizationService } from './organization.service';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { OrganizationSignupRequestDto } from './dto/organization-signup-request.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User, UserRole } from '../auth/user.entity';

@ApiTags('organizations')
@Controller('organizations')
export class OrganizationController {
  constructor(private readonly organizationService: OrganizationService) {}

  /** Public: prospect org signup — emails super admin (default Navi@igcollaborative.com; override SUPER_ADMIN_NOTIFICATION_EMAIL). */
  @Post('signup-request')
  @HttpCode(HttpStatus.ACCEPTED)
  async signupRequest(@Body() dto: OrganizationSignupRequestDto) {
    return this.organizationService.notifySignupRequest(dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  @ApiBearerAuth()
  @Get()
  async list() {
    return this.organizationService.findAllWithAdminNames();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.EMPLOYEE)
  @ApiBearerAuth()
  @Get('me')
  async getMyOrganization(@CurrentUser() user: Partial<User>) {
    const orgId = user.organizationId;
    if (!orgId) {
      throw new HttpException('Not linked to an organization.', HttpStatus.FORBIDDEN);
    }
    const id = typeof orgId === 'string' ? orgId : (orgId as { toString: () => string }).toString();
    const org = await this.organizationService.findOne(id);
    if (!org) throw new NotFoundException('Organization not found');
    return org;
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @ApiBearerAuth()
  @Patch('me')
  async updateMyOrganization(@CurrentUser() user: Partial<User>, @Body() dto: UpdateOrganizationDto) {
    const orgId = user.organizationId;
    if (!orgId) {
      throw new HttpException('Not linked to an organization.', HttpStatus.FORBIDDEN);
    }
    const id = typeof orgId === 'string' ? orgId : (orgId as { toString: () => string }).toString();
    const org = await this.organizationService.updateFromOrgMember(id, dto);
    if (!org) throw new NotFoundException('Organization not found');
    return org;
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  @ApiBearerAuth()
  @Post(':id/approve-employee-count')
  @HttpCode(HttpStatus.OK)
  async approveEmployeeCount(@Param('id') id: string) {
    const org = await this.organizationService.approvePendingEmployeeCount(id);
    if (!org) throw new NotFoundException('Organization not found');
    return org;
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  @ApiBearerAuth()
  @Get('signup-leads')
  async listSignupLeads() {
    return this.organizationService.findAllSignupLeads();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  @ApiBearerAuth()
  @Get('signup-leads/:leadId')
  async getSignupLead(@Param('leadId') leadId: string) {
    const lead = await this.organizationService.findSignupLeadById(leadId);
    if (!lead) throw new NotFoundException('Lead not found');
    return lead;
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  @ApiBearerAuth()
  @Get(':id')
  async getOne(@Param('id') id: string) {
    const org = await this.organizationService.findOne(id);
    if (!org) throw new NotFoundException('Organization not found');
    return org;
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  @ApiBearerAuth()
  @Patch(':id')
  async updateOrganization(@Param('id') id: string, @Body() dto: UpdateOrganizationDto) {
    const org = await this.organizationService.update(id, dto);
    if (!org) throw new NotFoundException('Organization not found');
    return org;
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  @ApiBearerAuth()
  @Post()
  async create(@Body() dto: CreateOrganizationDto) {
    return this.organizationService.createWithAdmin(dto);
  }
}
