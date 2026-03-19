import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { InitiativeModule } from '../initiative/initiative.module';
import { KnowledgeEntrySchema } from './knowledge-entry.entity';
import { KnowledgeHubController } from './knowledge-hub.controller';
import { KnowledgeHubService } from './knowledge-hub.service';

@Module({
  imports: [
    AuthModule,
    InitiativeModule,
    MongooseModule.forFeature([{ name: 'KnowledgeEntry', schema: KnowledgeEntrySchema }]),
  ],
  controllers: [KnowledgeHubController],
  providers: [KnowledgeHubService],
})
export class KnowledgeHubModule {}
