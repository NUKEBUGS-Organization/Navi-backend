import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { DiagnosticsService } from './features/diagnostics/diagnostics.service';
import { installProcessHandlers } from './features/diagnostics/process-handlers';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import 'dotenv/config';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  installProcessHandlers(app.get(DiagnosticsService));
  /** req.ip honours only X-Forwarded-For entries added by our own proxies */
  const proxyHops = parseInt(process.env.TRUST_PROXY_HOPS ?? '1', 10);
  app.set('trust proxy', Number.isNaN(proxyHops) ? 1 : proxyHops);
  /** Default ~100kb is too small for base64 profile photos */
  app.useBodyParser('json', { limit: '2mb' });
  app.enableCors({
    origin: [
      'http://localhost:5173',
      'https://localhost:5173',
      'http://127.0.0.1:5173',
      'https://127.0.0.1:5173',
      'https://app.changewithnavi.com',
      'https://navi-frontend.captain.changewithnavi.com',
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  const config = new DocumentBuilder()
    .setTitle('Navi API')
    .setDescription('The Navi API description')
    .setVersion('1.0')
    .addTag('navi')
    .build();
  const documentFactory = () => SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, documentFactory);
  const port = parseInt(String(process.env.PORT ?? 3000), 10) || 3000;
  await app.listen(port, '0.0.0.0');
}
// The unhandledRejection listener is non-fatal, so a failed startup must exit explicitly
// (otherwise the open Mongo connection keeps a zombie process alive).
bootstrap().catch((err: unknown) => {
  Logger.error(
    `Bootstrap failed: ${err instanceof Error ? err.message : String(err)}`,
    err instanceof Error ? err.stack : undefined,
    'Bootstrap',
  );
  process.exit(1);
});
