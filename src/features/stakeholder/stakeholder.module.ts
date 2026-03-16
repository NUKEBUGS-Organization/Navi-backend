import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { InitiativeModule } from '../initiative/initiative.module';
import { StakeholderSchema } from './stakeholder.entity';
import { StakeholderController } from './stakeholder.controller';
import { StakeholderService } from './stakeholder.service';

@Module({
  imports: [
    AuthModule,
    InitiativeModule,
    MongooseModule.forFeature([{ name: 'Stakeholder', schema: StakeholderSchema }]),
  ],
  controllers: [StakeholderController],
  providers: [StakeholderService],
  exports: [StakeholderService],
})
export class StakeholderModule {}
