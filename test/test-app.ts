import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { rmSync } from 'fs';
import { join } from 'path';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { HcmMockModule } from '../src/hcm-mock/hcm-mock.module';

export async function createHcmServer() {
  const app = await NestFactory.create(HcmMockModule, { logger: false });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  const server = await app.listen(0, '127.0.0.1');
  const address = server.address();
  const port = typeof address === 'string' ? 0 : address.port;
  return { app, port, baseUrl: `http://127.0.0.1:${port}` };
}

export async function createMainApp(name: string, hcmBaseUrl: string, listen = false) {
  const databasePath = join(process.cwd(), 'data', `${name}.sqlite`);
  rmSync(databasePath, { force: true });

  const app = await NestFactory.create(AppModule.register({
    databasePath,
    hcmBaseUrl,
    balanceStaleMs: 10_000,
  }), { logger: false });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  if (listen) {
    await app.listen(0, '127.0.0.1');
  } else {
    await app.init();
  }

  return {
    app,
    databasePath,
    dataSource: app.get(DataSource),
  };
}

export async function closeApps(...apps: Array<{ close: () => Promise<void> } | undefined>): Promise<void> {
  for (const app of apps) {
    if (app) {
      await app.close();
    }
  }
}
