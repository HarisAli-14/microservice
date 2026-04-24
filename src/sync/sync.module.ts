import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '../audit/audit.module';
import { BalancesModule } from '../balances/balances.module';
import { HcmClientModule } from '../hcm-client/hcm-client.module';
import { BalanceSyncEvent } from '../entities/balance-sync-event.entity';
import { Balance } from '../entities/balance.entity';
import { SyncController } from './sync.controller';
import { SyncService } from './sync.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Balance, BalanceSyncEvent]),
    AuditModule,
    BalancesModule,
    HcmClientModule,
  ],
  controllers: [SyncController],
  providers: [SyncService],
  exports: [SyncService],
})
export class SyncModule {}
