import { Module } from '@nestjs/common';
import { InitiativeModule } from '../initiative/initiative.module';
import { TaskModule } from '../task/task.module';
import { AdoptionModule } from '../adoption/adoption.module';
import { ActivityController } from './activity.controller';
import { ActivityService } from './activity.service';

@Module({
  imports: [InitiativeModule, TaskModule, AdoptionModule],
  controllers: [ActivityController],
  providers: [ActivityService],
  exports: [ActivityService],
})
export class ActivityModule {}
