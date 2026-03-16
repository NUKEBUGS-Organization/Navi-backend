import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { InitiativeModule } from '../initiative/initiative.module';
import { TaskSchema } from './task.entity';
import { TaskCommentSchema } from './task-comment.entity';
import { TaskController } from './task.controller';
import { TaskService } from './task.service';
import { TaskCommentService } from './task-comment.service';

@Module({
  imports: [
    AuthModule,
    InitiativeModule,
    MongooseModule.forFeature([
      { name: 'Task', schema: TaskSchema },
      { name: 'TaskComment', schema: TaskCommentSchema },
    ]),
  ],
  controllers: [TaskController],
  providers: [TaskService, TaskCommentService],
  exports: [TaskService],
})
export class TaskModule {}
