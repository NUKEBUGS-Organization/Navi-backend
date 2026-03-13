import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from './features/auth/auth.module';

@Module({
  imports: [
    MongooseModule.forRoot('mongodb://localhost:27017/navi'),
    AuthModule,
  ],
  providers: [],
  controllers: [],
})
export class AppModule {}
