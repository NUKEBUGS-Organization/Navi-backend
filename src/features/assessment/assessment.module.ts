import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { AssessmentSchema } from './assessment.entity';
import { AssessmentSubmissionSchema } from './assessment-submission.entity';
import { AssessmentController } from './assessment.controller';
import { AssessmentSubmissionController } from './assessment-submission.controller';
import { AssessmentService } from './assessment.service';
import { AssessmentSubmissionService } from './assessment-submission.service';

@Module({
  imports: [
    AuthModule,
    MongooseModule.forFeature([
      { name: 'Assessment', schema: AssessmentSchema },
      { name: 'AssessmentSubmission', schema: AssessmentSubmissionSchema },
    ]),
  ],
  controllers: [AssessmentController, AssessmentSubmissionController],
  providers: [AssessmentService, AssessmentSubmissionService],
  exports: [AssessmentService, AssessmentSubmissionService],
})
export class AssessmentModule {}
