import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { OrganizationModule } from './modules/organization/organization.module';

@Module({
  imports: [
    MongooseModule.forRoot('mongodb://localhost:27017/navi_platform'),
    OrganizationModule
  ],
})
export class AppModule {}