import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { InitiativeModule } from '../initiative/initiative.module';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { AiCommunicationService } from './ai-communication.service';

@Module({
  imports: [AuthModule, InitiativeModule],
  controllers: [AiController],
  providers: [AiService, AiCommunicationService],
  exports: [AiService],
})
export class AiModule {}
