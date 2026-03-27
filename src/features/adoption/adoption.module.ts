import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { InitiativeModule } from '../initiative/initiative.module';
import { AdoptionSchema } from './adoption.entity';
import { TaskSchema } from '../task/task.entity';
import { AdoptionController } from './adoption.controller';
import { AdoptionService } from './adoption.service';

@Module({
  imports: [
    AuthModule,
    forwardRef(() => InitiativeModule),
    MongooseModule.forFeature([
      { name: 'Adoption', schema: AdoptionSchema },
      { name: 'Task', schema: TaskSchema },
    ]),
  ],
  controllers: [AdoptionController],
  providers: [AdoptionService],
  exports: [AdoptionService, MongooseModule.forFeature([{ name: 'Adoption', schema: AdoptionSchema }])],
})
export class AdoptionModule {}
