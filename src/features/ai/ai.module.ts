import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { InitiativeModule } from '../initiative/initiative.module';
import { TaskSchema } from '../task/task.entity';
import { RiskSchema } from '../risk/risk.entity';
import { AdoptionSchema } from '../adoption/adoption.entity';
import { StakeholderSchema } from '../stakeholder/stakeholder.entity';
import { CommunicationSchema } from '../communication/communication.entity';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { AiContextService } from './ai-context.service';
import { AiCommunicationService } from './ai-communication.service';
import { AiInitiativeHealthService } from './ai-initiative-health.service';
import { AiRiskService } from './ai-risk.service';

@Module({
  imports: [
    AuthModule,
    InitiativeModule,
    MongooseModule.forFeature([
      { name: 'Task', schema: TaskSchema },
      { name: 'Risk', schema: RiskSchema },
      { name: 'Adoption', schema: AdoptionSchema },
      { name: 'Stakeholder', schema: StakeholderSchema },
      { name: 'Communication', schema: CommunicationSchema },
    ]),
  ],
  controllers: [AiController],
  providers: [AiService, AiContextService, AiCommunicationService, AiInitiativeHealthService, AiRiskService],
  exports: [AiService],
})
export class AiModule {}
