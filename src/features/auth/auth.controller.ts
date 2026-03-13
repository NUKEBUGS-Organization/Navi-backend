import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { User } from './user.entity';
import {
  ChangePasswordDto,
  CreateUserDto,
  LoginDto,
  ResetPasswordDto,
  SignupDto,
  UpdateUserDto,
} from './dto/auth.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Get()
  async findAll(): Promise<User[]> {
    return this.authService.findAll();
  }

  @Get(':id')
  async findOne(@Param('id') id: string): Promise<User | null> {
    return this.authService.findOne(id);
  }

  @Post()
  async create(@Body() user: CreateUserDto): Promise<User> {
    return this.authService.create(user);
  }

  @Post('signup')
  async signup(@Body() user: SignupDto): Promise<User> {
    return this.authService.Signup(user);
  }

  @Post('login')
  async login(@Body() body: LoginDto): Promise<User | null> {
    return  await this.authService.Login(body);
  }

  @Post('reset-password')
  async resetPassword(@Body() body: ResetPasswordDto): Promise<User | null> {
    return this.authService.ResetPassword(body);
  }

  @Post('change-password')
  async changePassword(@Body() body: ChangePasswordDto): Promise<User | null> {
    return this.authService.ChangePassword(body);
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() user: UpdateUserDto,
  ): Promise<User | null> {
    return this.authService.update(id, user);
  }

  @Delete(':id')
  async delete(@Param('id') id: string): Promise<string> {
    return this.authService.delete(id);
  }
}
