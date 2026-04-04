import {
  Body,
  Controller,
  Delete,
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
import { AuthService, LoginResponse } from './auth.service';
import { User, UserRole } from './user.entity';
import {
  BulkImportUsersDto,
  ChangePasswordDto,
  CreateUserDto,
  ForgotPasswordRequestDto,
  LoginDto,
  ResetPasswordDto,
  SignupDto,
  UpdateProfileDto,
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

  /** Call once to create super admins if missing. No auth required. */
  @Post('ensure-super-admin')
  async ensureSuperAdmin(): Promise<{ message: string }> {
    await this.authService.seedSuperAdmins();
    return {
      message:
        'Super admins ready. superadmin@gmail.com / karaboyce — superadmin2@gmail.com / superadmin — superadmin@azib.com / azib@123',
    };
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Get('me')
  async getProfile(@CurrentUser() user: Partial<User>) {
    return user;
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Patch('me/profile')
  async updateMyProfile(@Body() body: UpdateProfileDto, @CurrentUser() user: Partial<User>) {
    const raw = (user as { _id?: { toString: () => string } })._id;
    const userId = raw?.toString?.() ?? (user as { _id?: string })._id;
    if (!userId) {
      throw new HttpException('Invalid user.', HttpStatus.BAD_REQUEST);
    }
    const updated = await this.authService.updateMyProfile(userId, body);
    if (!updated) {
      throw new HttpException('User not found.', HttpStatus.NOT_FOUND);
    }
    return updated;
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

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @Post('users/bulk-import')
  @HttpCode(HttpStatus.OK)
  async bulkImportUsers(@Body() dto: BulkImportUsersDto, @CurrentUser() currentUser: Partial<User>) {
    return this.authService.bulkImportUsersFromCsv(dto.csvText, currentUser);
  }

  @Post('signup')
  async signup(@Body() user: SignupDto): Promise<User> {
    return this.authService.Signup(user);
  }

  /** Request a 6-digit OTP by email (public). Always returns the same message if mail is configured. */
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  async forgotPassword(@Body() body: ForgotPasswordRequestDto) {
    return this.authService.requestPasswordResetOtp(body.email);
  }

  /** Set a new password using email + OTP from forgot-password (public). */
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  async resetPassword(@Body() body: ResetPasswordDto) {
    return this.authService.resetPasswordWithOtp(body);
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
