import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User, UserRole } from '../auth/user.entity';
import { KudosService } from './kudos.service';
import { CreateManagerKudosDto } from './dto/create-manager-kudos.dto';

@ApiTags('kudos')
@Controller('kudos')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.EMPLOYEE, UserRole.SUPER_ADMIN)
@ApiBearerAuth()
export class KudosController {
  constructor(private readonly kudosService: KudosService) {}

  @Get('me/summary')
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.EMPLOYEE, UserRole.SUPER_ADMIN)
  async mySummary(@CurrentUser() user: Partial<User>) {
    return this.kudosService.getMySummary(user);
  }

  @Get('me')
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.EMPLOYEE, UserRole.SUPER_ADMIN)
  async myKudos(@CurrentUser() user: Partial<User>) {
    return this.kudosService.getMyKudosList(user);
  }

  @Get('initiatives')
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.SUPER_ADMIN)
  async initiatives(@CurrentUser() user: Partial<User>) {
    return this.kudosService.listKudosInitiatives(user);
  }

  @Get('initiatives/:initiativeId/contributions')
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.SUPER_ADMIN)
  async contributions(
    @CurrentUser() user: Partial<User>,
    @Param('initiativeId') initiativeId: string,
  ) {
    return this.kudosService.listContributionsForInitiative(user, initiativeId);
  }

  @Post('contributions/:contributionId/manager-star')
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.SUPER_ADMIN)
  async giveManagerStar(
    @CurrentUser() user: Partial<User>,
    @Param('contributionId') contributionId: string,
  ) {
    return this.kudosService.awardManagerStar(user, contributionId);
  }

  @Post('manager-award')
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.SUPER_ADMIN)
  async createManagerAward(@CurrentUser() user: Partial<User>, @Body() dto: CreateManagerKudosDto) {
    return this.kudosService.createManagerDirectAward(user, dto.initiativeId, dto.employeeId, dto.note);
  }
}

