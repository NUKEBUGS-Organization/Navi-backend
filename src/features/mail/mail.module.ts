import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MailCoreModule } from './mail-core.module';
import { MailController } from './mail.controller';

@Module({
  imports: [MailCoreModule, AuthModule],
  controllers: [MailController],
  exports: [MailCoreModule],
})
export class MailModule {}
