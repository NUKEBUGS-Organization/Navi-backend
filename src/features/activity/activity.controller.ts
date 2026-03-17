import { Controller, Get, HttpException, HttpStatus, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User, UserRole } from '../auth/user.entity';
import { ActivityService } from './activity.service';

@ApiTags('activity')
@Controller('activity')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.EMPLOYEE)
@ApiBearerAuth()
export class ActivityController {
  constructor(private readonly activityService: ActivityService) {}

  private getOrgId(user: Partial<User>): string {
    const orgId = user.organizationId;
    if (!orgId) {
      throw new HttpException('Not linked to an organization.', HttpStatus.FORBIDDEN);
    }
    return typeof orgId === 'string' ? orgId : (orgId as { toString: () => string }).toString();
  }

  @Get()
  async getInitiativeActivity(
    @Query('initiativeId') initiativeId: string,
    @CurrentUser() user: Partial<User>,
  ) {
    if (!initiativeId?.trim()) {
      throw new HttpException('initiativeId is required.', HttpStatus.BAD_REQUEST);
    }
    const orgId = this.getOrgId(user);
    return this.activityService.getActivity(initiativeId.trim(), orgId);
  }
}
