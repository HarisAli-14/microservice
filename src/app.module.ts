import { DynamicModule, Module } from '@nestjs/common';
import { AuditModule } from './audit/audit.module';
import { BalancesModule } from './balances/balances.module';
import { AppOptions } from './common/types';
import { DatabaseModule } from './database/database.module';
import { HcmClientModule } from './hcm-client/hcm-client.module';
import { SyncModule } from './sync/sync.module';
import { TestingModule } from './testing/testing.module';
import { TimeOffRequestsModule } from './time-off-requests/time-off-requests.module';

@Module({})
export class AppModule {
  static register(options: AppOptions = {}): DynamicModule {
    return {
      module: AppModule,
      imports: [
        DatabaseModule.register(options),
        AuditModule,
        HcmClientModule,
        BalancesModule,
        TimeOffRequestsModule,
        SyncModule,
        TestingModule,
      ],
    };
  }
}
