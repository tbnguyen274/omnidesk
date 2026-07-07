import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { requestLoggerMiddleware } from './common/observability/request-logger.middleware';
import { appConfig } from './config/app.config';
import { validateProviderConfig } from './config/provider.config';

async function bootstrap() {
  validateProviderConfig();

  const app = await NestFactory.create(AppModule, {
    rawBody: true,
  });
  app.use(helmet());
  app.use(cookieParser());
  app.use(requestLoggerMiddleware);
  app.setGlobalPrefix('api');
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });
  app.enableCors({
    origin: appConfig.webOrigin,
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const config = new DocumentBuilder()
    .setTitle('OmniDesk API')
    .setDescription('The OmniDesk API documentation')
    .setVersion('1.0')
    .addCookieAuth('Authentication')
    .build();
  const documentFactory = () => SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, documentFactory);

  await app.listen(appConfig.apiPort);
}
void bootstrap();
