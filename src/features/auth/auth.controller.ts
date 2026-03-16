import {
  Body,
  Controller,
  Delete,
  Get,
  HttpException,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthService, LoginResponse } from './auth.service';
import { User, UserRole } from './user.entity';
import {
  ChangePasswordDto,
  CreateUserDto,
  LoginDto,
  ResetPasswordDto,
  SignupDto,
  UpdateUserDto,
} from './dto/auth.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { Roles } from './decorators/roles.decorator';
import { CurrentUser } from './decorators/current-user.decorator';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Get('ping')
  ping(): { ok: boolean; message: string } {
    return { ok: true, message: 'Auth API is reachable' };
  }

  @Post('login')
  async login(@Body() body: LoginDto): Promise<LoginResponse> {
    return this.authService.loginWithToken(body);
  }

  /** Call once to create super admin (superadmin@gmail.com / karaboyce) if missing. No auth required. */
  @Post('ensure-super-admin')
  async ensureSuperAdmin(): Promise<{ message: string }> {
    await this.authService.seedSuperAdmins();
    return { message: 'Super admins ready. superadmin@gmail.com / karaboyce — superadmin2@gmail.com / superadmin' };
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Get('me')
  async getProfile(@CurrentUser() user: Partial<User>) {
    return user;
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.EMPLOYEE)
  @ApiBearerAuth()
  @Get('organization/users')
  async getOrganizationUsers(@CurrentUser() currentUser: Partial<User>) {
    const orgId = currentUser.organizationId;
    if (!orgId) {
      throw new HttpException(
        'Not linked to an organization.',
        HttpStatus.FORBIDDEN,
      );
    }
    const id = typeof orgId === 'string' ? orgId : (orgId as { toString: () => string }).toString();
    return this.authService.findAllByOrganization(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  @ApiBearerAuth()
  @Get()
  async findAll(): Promise<User[]> {
    return this.authService.findAll();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  @ApiBearerAuth()
  @Get('users/:id')
  async findOne(@Param('id') id: string): Promise<User | null> {
    return this.authService.findOne(id);
  }

  /** Super admin: create admins. Org admin: create admins/managers/employees for their org. */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @ApiBearerAuth()
  @Post('users')
  async createUser(
    @Body() user: CreateUserDto,
    @CurrentUser() currentUser: Partial<User>,
  ) {
    const created = await this.authService.create(user, currentUser.role, currentUser);
    return this.authService.sanitizeUser(created);
  }

  @Post('signup')
  async signup(@Body() user: SignupDto): Promise<User> {
    return this.authService.Signup(user);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post('reset-password')
  async resetPassword(@Body() body: ResetPasswordDto): Promise<User | null> {
    return this.authService.ResetPassword(body);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post('change-password')
  async changePassword(@Body() body: ChangePasswordDto): Promise<User | null> {
    return this.authService.ChangePassword(body);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @ApiBearerAuth()
  @Patch('users/:id')
  async update(
    @Param('id') id: string,
    @Body() body: UpdateUserDto,
    @CurrentUser() currentUser: Partial<User>,
  ) {
    const updated = await this.authService.update(id, body, currentUser);
    return updated ? this.authService.sanitizeUser(updated) : null;
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @ApiBearerAuth()
  @Delete('users/:id')
  async delete(
    @Param('id') id: string,
    @CurrentUser() currentUser: Partial<User>,
  ): Promise<{ message: string }> {
    await this.authService.delete(id, currentUser);
    return { message: 'User deleted successfully' };
  }
}
