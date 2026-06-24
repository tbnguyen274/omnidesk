import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { validateProviderConfig } from './config/provider.config';

async function bootstrap() {
  validateProviderConfig();

  const app = await NestFactory.create(AppModule);
  await app.listen(process.env.WORKER_PORT ?? process.env.PORT ?? 3001);
}
void bootstrap();
