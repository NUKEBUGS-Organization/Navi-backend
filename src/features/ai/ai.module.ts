import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { InitiativeModule } from '../initiative/initiative.module';
import { TaskSchema } from '../task/task.entity';
import { RiskSchema } from '../risk/risk.entity';
import { AdoptionSchema } from '../adoption/adoption.entity';
import { StakeholderSchema } from '../stakeholder/stakeholder.entity';
import { CommunicationSchema } from '../communication/communication.entity';
import { AssessmentSchema } from '../assessment/assessment.entity';
import { AssessmentSubmissionSchema } from '../assessment/assessment-submission.entity';
import { UserSchema } from '../auth/user.entity';
import { KnowledgeEntrySchema } from '../knowledge-hub/knowledge-entry.entity';
import { AiEmbeddingSchema } from './ai-embedding.entity';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { AiContextService } from './ai-context.service';
import { AiCommunicationService } from './ai-communication.service';
import { AiInitiativeHealthService } from './ai-initiative-health.service';
import { AiRiskService } from './ai-risk.service';
import { AiAssessmentService } from './ai-assessment.service';
import { AiKnowledgeService } from './ai-knowledge.service';
import { AiStakeholderService } from './ai-stakeholder.service';
import { AiAdoptionService } from './ai-adoption.service';
import { AiInitiativeDraftService } from './ai-initiative-draft.service';

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
      { name: 'Assessment', schema: AssessmentSchema },
      { name: 'AssessmentSubmission', schema: AssessmentSubmissionSchema },
      { name: 'User', schema: UserSchema },
      { name: 'KnowledgeEntry', schema: KnowledgeEntrySchema },
      { name: 'AiEmbedding', schema: AiEmbeddingSchema },
    ]),
  ],
  controllers: [AiController],
  providers: [AiService, AiContextService, AiCommunicationService, AiInitiativeHealthService, AiRiskService, AiAssessmentService, AiKnowledgeService, AiStakeholderService, AiAdoptionService, AiInitiativeDraftService],
  exports: [AiService],
})
export class AiModule {}
