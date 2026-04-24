import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DatabaseSeedService } from '../database/database-seed.service';
import { AuditLog } from '../entities/audit-log.entity';
import { BalanceSyncEvent } from '../entities/balance-sync-event.entity';
import { Balance } from '../entities/balance.entity';
import { Employee } from '../entities/employee.entity';
import { Location } from '../entities/location.entity';
import { TimeOffRequest } from '../entities/time-off-request.entity';

@Injectable()
export class TestingService {
  constructor(
    @InjectRepository(AuditLog)
    private readonly auditRepository: Repository<AuditLog>,
    @InjectRepository(BalanceSyncEvent)
    private readonly syncEventRepository: Repository<BalanceSyncEvent>,
    @InjectRepository(TimeOffRequest)
    private readonly requestRepository: Repository<TimeOffRequest>,
    @InjectRepository(Balance)
    private readonly balanceRepository: Repository<Balance>,
    @InjectRepository(Employee)
    private readonly employeeRepository: Repository<Employee>,
    @InjectRepository(Location)
    private readonly locationRepository: Repository<Location>,
    private readonly seedService: DatabaseSeedService,
  ) {}

  async reset(): Promise<{ status: string }> {
    await this.auditRepository.clear();
    await this.syncEventRepository.clear();
    await this.requestRepository.clear();
    await this.balanceRepository.clear();
    await this.employeeRepository.clear();
    await this.locationRepository.clear();
    await this.seedService.onApplicationBootstrap();
    return { status: 'reset' };
  }
}
