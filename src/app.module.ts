import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from './features/auth/auth.module';

@Module({
  imports: [
    MongooseModule.forRoot(
      'mongodb+srv://navi:navibackend@cluster0.nktmmeq.mongodb.net/navi?appName=Cluster0',
    ),
    AuthModule,
  ],
  providers: [],
  controllers: [],
})
export class AppModule {}
