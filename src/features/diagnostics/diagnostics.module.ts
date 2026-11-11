import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { ErrorGroupSchema } from './error-group.entity';
import { ErrorEventSchema } from './error-event.entity';
import { DiagnosticsService } from './diagnostics.service';
import { AllExceptionsFilter } from './all-exceptions.filter';
import { DiagnosticsController } from './diagnostics.controller';
import { ClientReportRateLimiter } from './rate-limiter';

@Module({
  imports: [
    AuthModule,
    MongooseModule.forFeature([
      { name: 'ErrorGroup', schema: ErrorGroupSchema },
      { name: 'ErrorEvent', schema: ErrorEventSchema },
    ]),
  ],
  controllers: [DiagnosticsController],
  providers: [
    {
      provide: ClientReportRateLimiter,
      useValue: new ClientReportRateLimiter(60),
    },
    DiagnosticsService,
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
  exports: [DiagnosticsService],
})
export class DiagnosticsModule {}
