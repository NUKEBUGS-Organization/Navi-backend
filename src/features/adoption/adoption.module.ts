import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { InitiativeModule } from '../initiative/initiative.module';
import { AdoptionSchema } from './adoption.entity';
import { AdoptionController } from './adoption.controller';
import { AdoptionService } from './adoption.service';

@Module({
  imports: [
    AuthModule,
    InitiativeModule,
    MongooseModule.forFeature([{ name: 'Adoption', schema: AdoptionSchema }]),
  ],
  controllers: [AdoptionController],
  providers: [AdoptionService],
  exports: [AdoptionService],
})
export class AdoptionModule {}
