import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { HcmMockModule } from './hcm-mock/hcm-mock.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(HcmMockModule);
  app.enableCors();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.listen(Number(process.env.HCM_PORT ?? 3001));
}

bootstrap();
