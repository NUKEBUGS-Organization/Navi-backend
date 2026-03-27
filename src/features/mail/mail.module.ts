import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MailService } from './mail.service';
import { MailController } from './mail.controller';

@Module({
  imports: [AuthModule],
  controllers: [MailController],
  providers: [MailService],
  exports: [MailService],
})
export class MailModule {}
