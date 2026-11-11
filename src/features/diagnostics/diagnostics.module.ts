import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { ErrorGroupSchema } from './error-group.entity';
import { ErrorEventSchema } from './error-event.entity';
import { DiagnosticsService } from './diagnostics.service';

@Module({
  imports: [
    AuthModule,
    MongooseModule.forFeature([
      { name: 'ErrorGroup', schema: ErrorGroupSchema },
      { name: 'ErrorEvent', schema: ErrorEventSchema },
    ]),
  ],
  providers: [DiagnosticsService],
  exports: [DiagnosticsService],
})
export class DiagnosticsModule {}
