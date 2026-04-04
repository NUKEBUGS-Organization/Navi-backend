import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { InitiativeModule } from '../initiative/initiative.module';
import { AssessmentSchema } from './assessment.entity';
import { AssessmentSubmissionSchema } from './assessment-submission.entity';
import { AssessmentController } from './assessment.controller';
import { AssessmentSubmissionController } from './assessment-submission.controller';
import { AssessmentService } from './assessment.service';
import { AssessmentSubmissionService } from './assessment-submission.service';
import { KudosModule } from '../kudos/kudos.module';
import { UserSchema } from '../auth/user.entity';

@Module({
  imports: [
    AuthModule,
    InitiativeModule,
    KudosModule,
    MongooseModule.forFeature([
      { name: 'Assessment', schema: AssessmentSchema },
      { name: 'AssessmentSubmission', schema: AssessmentSubmissionSchema },
      { name: 'User', schema: UserSchema },
    ]),
  ],
  controllers: [AssessmentController, AssessmentSubmissionController],
  providers: [AssessmentService, AssessmentSubmissionService],
  exports: [AssessmentService, AssessmentSubmissionService],
})
export class AssessmentModule {}
