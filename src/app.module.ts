import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from './features/auth/auth.module';
import { OrganizationModule } from './features/organization/organization.module';
import { InitiativeModule } from './features/initiative/initiative.module';
import { AssessmentModule } from './features/assessment/assessment.module';
import { TaskModule } from './features/task/task.module';
import { StakeholderModule } from './features/stakeholder/stakeholder.module';
import { CommunicationModule } from './features/communication/communication.module';
import { AdoptionModule } from './features/adoption/adoption.module';
import { RiskModule } from './features/risk/risk.module';
import { ActivityModule } from './features/activity/activity.module';

const DEFAULT_MONGO_URI =
  'mongodb+srv://navi:navibackend@cluster0.nktmmeq.mongodb.net/navi?appName=Cluster0';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        uri: config.get<string>('MONGODB_URI') ?? DEFAULT_MONGO_URI,
      }),
      inject: [ConfigService],
    }),
    AuthModule,
    OrganizationModule,
    InitiativeModule,
    AssessmentModule,
    TaskModule,
    StakeholderModule,
    CommunicationModule,
    AdoptionModule,
    RiskModule,
    ActivityModule,
  ],
  providers: [],
  controllers: [],
})
export class AppModule {}
