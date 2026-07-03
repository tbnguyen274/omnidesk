import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { appConfig } from './config/app.config';
import { validateProviderConfig } from './config/provider.config';

async function bootstrap() {
  validateProviderConfig();

  const app = await NestFactory.create(AppModule, {
    rawBody: true,
  });
  app.use(helmet());
  app.use(cookieParser());
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
  await app.listen(appConfig.apiPort);
}
void bootstrap();
