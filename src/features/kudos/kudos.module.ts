import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { InitiativeModule } from '../initiative/initiative.module';
import { KudosContributionSchema } from './kudos.entity';
import { KudosController } from './kudos.controller';
import { KudosService } from './kudos.service';
import { UserSchema } from '../auth/user.entity';

@Module({
  imports: [
    AuthModule,
    InitiativeModule,
    MongooseModule.forFeature([
      { name: 'KudosContribution', schema: KudosContributionSchema },
      { name: 'User', schema: UserSchema },
    ]),
  ],
  controllers: [KudosController],
  providers: [KudosService],
  exports: [KudosService],
})
export class KudosModule {}

