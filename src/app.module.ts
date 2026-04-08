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
import { KudosModule } from './features/kudos/kudos.module';
import { KnowledgeHubModule } from './features/knowledge-hub/knowledge-hub.module';
import { MailModule } from './features/mail/mail.module';
import { AppController } from './app.controller';

/** Local default avoids Atlas SRV DNS (`querySrv ECONNREFUSED`) when offline/VPN/firewall blocks SRV. Set MONGODB_URI for Atlas/production. */
const DEFAULT_MONGO_URI = 'mongodb://127.0.0.1:27017/navi';

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
    KudosModule,
    KnowledgeHubModule,
    MailModule,
  ],
  providers: [],
  controllers: [AppController],
})
export class AppModule {}
