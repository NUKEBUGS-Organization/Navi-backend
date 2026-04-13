import { Module, OnModuleInit } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { MongooseModule } from '@nestjs/mongoose';
import { PassportModule } from '@nestjs/passport';
import { UserSchema } from './user.entity';
import { OrganizationSchema } from '../organization/organization.entity';
import { PasswordResetOtpSchema } from './password-reset-otp.entity';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { MailCoreModule } from '../mail/mail-core.module';

@Module({
  imports: [
    MailCoreModule,
    MongooseModule.forFeature([
      { name: 'User', schema: UserSchema },
      { name: 'PasswordResetOtp', schema: PasswordResetOtpSchema },
      { name: 'Organization', schema: OrganizationSchema },
    ]),
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'navi-jwt-secret-change-in-production',
      signOptions: { expiresIn: '7d' },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  exports: [AuthService, JwtModule],
})
export class AuthModule implements OnModuleInit {
  constructor(private readonly authService: AuthService) {}

  async onModuleInit() {
    await this.authService.seedSuperAdmins();
  }
}
