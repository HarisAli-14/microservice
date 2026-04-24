import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditLog } from '../entities/audit-log.entity';
import { BalanceSyncEvent } from '../entities/balance-sync-event.entity';
import { Balance } from '../entities/balance.entity';
import { Employee } from '../entities/employee.entity';
import { Location } from '../entities/location.entity';
import { TimeOffRequest } from '../entities/time-off-request.entity';
import { DatabaseModule } from '../database/database.module';
import { TestingController } from './testing.controller';
import { TestingService } from './testing.service';

@Module({
  imports: [
    DatabaseModule,
    TypeOrmModule.forFeature([AuditLog, BalanceSyncEvent, Balance, Employee, Location, TimeOffRequest]),
  ],
  controllers: [TestingController],
  providers: [TestingService],
})
export class TestingModule {}
