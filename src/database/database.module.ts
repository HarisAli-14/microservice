import { DynamicModule, Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { mkdirSync } from 'fs';
import { dirname, resolve } from 'path';
import { APP_OPTIONS, DEFAULT_BALANCE_STALE_MS } from '../common/constants';
import { AppOptions } from '../common/types';
import { AuditLog } from '../entities/audit-log.entity';
import { BalanceSyncEvent } from '../entities/balance-sync-event.entity';
import { Balance } from '../entities/balance.entity';
import { Employee } from '../entities/employee.entity';
import { Location } from '../entities/location.entity';
import { TimeOffRequest } from '../entities/time-off-request.entity';
import { DatabaseSeedService } from './database-seed.service';

@Global()
@Module({})
export class DatabaseModule {
  static register(options: AppOptions = {}): DynamicModule {
    const databasePath = resolve(options.databasePath ?? 'data/main.sqlite');
    mkdirSync(dirname(databasePath), { recursive: true });

    return {
      module: DatabaseModule,
      imports: [
        TypeOrmModule.forRoot({
          type: 'sqlite',
          database: databasePath,
          entities: [Employee, Location, Balance, TimeOffRequest, BalanceSyncEvent, AuditLog],
          synchronize: true,
        }),
        TypeOrmModule.forFeature([Employee, Location, Balance, TimeOffRequest, BalanceSyncEvent, AuditLog]),
      ],
      providers: [
        {
          provide: APP_OPTIONS,
          useValue: {
            databasePath,
            hcmBaseUrl: options.hcmBaseUrl ?? 'http://127.0.0.1:3001',
            balanceStaleMs: options.balanceStaleMs ?? DEFAULT_BALANCE_STALE_MS,
          },
        },
        DatabaseSeedService,
      ],
      exports: [TypeOrmModule, APP_OPTIONS, DatabaseSeedService],
    };
  }
}
