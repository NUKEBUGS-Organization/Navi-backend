import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { InitiativeModule } from '../initiative/initiative.module';
import { MailCoreModule } from '../mail/mail-core.module';
import { UserSchema } from '../auth/user.entity';
import { CommunicationSchema } from './communication.entity';
import { CommunicationController } from './communication.controller';
import { CommunicationService } from './communication.service';

@Module({
  imports: [
    AuthModule,
    InitiativeModule,
    MailCoreModule,
    MongooseModule.forFeature([
      { name: 'Communication', schema: CommunicationSchema },
      { name: 'User', schema: UserSchema },
    ]),
  ],
  controllers: [CommunicationController],
  providers: [CommunicationService],
  exports: [CommunicationService],
})
export class CommunicationModule {}
