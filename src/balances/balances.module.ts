import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Balance } from '../entities/balance.entity';
import { Employee } from '../entities/employee.entity';
import { Location } from '../entities/location.entity';
import { AuditModule } from '../audit/audit.module';
import { HcmClientModule } from '../hcm-client/hcm-client.module';
import { BalancesController } from './balances.controller';
import { BalancesService } from './balances.service';

@Module({
  imports: [TypeOrmModule.forFeature([Balance, Employee, Location]), AuditModule, HcmClientModule],
  controllers: [BalancesController],
  providers: [BalancesService],
  exports: [BalancesService],
})
export class BalancesModule {}
