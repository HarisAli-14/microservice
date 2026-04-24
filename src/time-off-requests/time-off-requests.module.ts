import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '../audit/audit.module';
import { BalancesModule } from '../balances/balances.module';
import { HcmClientModule } from '../hcm-client/hcm-client.module';
import { BalanceSyncEvent } from '../entities/balance-sync-event.entity';
import { Balance } from '../entities/balance.entity';
import { TimeOffRequest } from '../entities/time-off-request.entity';
import { TimeOffRequestsController } from './time-off-requests.controller';
import { TimeOffRequestsService } from './time-off-requests.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([TimeOffRequest, Balance, BalanceSyncEvent]),
    AuditModule,
    BalancesModule,
    HcmClientModule,
  ],
  controllers: [TimeOffRequestsController],
  providers: [TimeOffRequestsService],
  exports: [TimeOffRequestsService],
})
export class TimeOffRequestsModule {}
