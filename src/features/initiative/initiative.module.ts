import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { TaskModule } from '../task/task.module';
import { InitiativeSchema } from './initiative.entity';
import { InitiativeController } from './initiative.controller';
import { InitiativeService } from './initiative.service';
import { TaskSchema } from '../task/task.entity';

@Module({
  imports: [
    AuthModule,
    forwardRef(() => TaskModule),
    MongooseModule.forFeature([
      { name: 'Initiative', schema: InitiativeSchema },
      { name: 'Task', schema: TaskSchema },
    ]),
  ],
  controllers: [InitiativeController],
  providers: [InitiativeService],
  exports: [InitiativeService],
})
export class InitiativeModule {}
