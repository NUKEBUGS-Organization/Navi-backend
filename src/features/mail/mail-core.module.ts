import { Module } from '@nestjs/common';
import { MailService } from './mail.service';

/** Mail without Auth — safe to import from AuthModule (avoids MailModule ↔ AuthModule cycle). */
@Module({
  providers: [MailService],
  exports: [MailService],
})
export class MailCoreModule {}
