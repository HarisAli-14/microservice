import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { APP_OPTIONS } from '../common/constants';
import { BalanceSyncEventType } from '../common/enums';
import { BalanceSnapshot, AppOptions } from '../common/types';
import { AuditService } from '../audit/audit.service';
import { Balance } from '../entities/balance.entity';
import { Employee } from '../entities/employee.entity';
import { Location } from '../entities/location.entity';
import { HcmClientService } from '../hcm-client/hcm-client.service';
import { HcmClientError } from '../hcm-client/hcm-client.service';

@Injectable()
export class BalancesService {
  constructor(
    @InjectRepository(Balance)
    private readonly balanceRepository: Repository<Balance>,
    @InjectRepository(Employee)
    private readonly employeeRepository: Repository<Employee>,
    @InjectRepository(Location)
    private readonly locationRepository: Repository<Location>,
    private readonly hcmClientService: HcmClientService,
    private readonly auditService: AuditService,
    @Inject(APP_OPTIONS)
    private readonly options: AppOptions,
  ) {}

  hasSufficientBalance(balance: Pick<Balance, 'availableDays'>, daysRequested: number): boolean {
    return balance.availableDays >= daysRequested;
  }

  async getBalanceOrThrow(employeeId: number, locationId: number): Promise<Balance> {
    const balance = await this.balanceRepository.findOne({ where: { employeeId, locationId } });
    if (!balance) {
      throw new NotFoundException('Balance not found');
    }
    return balance;
  }

  async ensureEmployeeAndLocation(employeeId: number, locationId: number): Promise<void> {
    const [employee, location] = await Promise.all([
      this.employeeRepository.findOne({ where: { id: employeeId } }),
      this.locationRepository.findOne({ where: { id: locationId } }),
    ]);

    if (!employee || !location) {
      throw new BadRequestException('Invalid employee/location combination');
    }
  }

  async getCachedBalance(employeeId: number, locationId: number): Promise<Balance | null> {
    return this.balanceRepository.findOne({ where: { employeeId, locationId } });
  }

  async getOrRefreshBalance(employeeId: number, locationId: number, forceRefresh = false): Promise<Balance> {
    await this.ensureEmployeeAndLocation(employeeId, locationId);
    const localBalance = await this.balanceRepository.findOne({ where: { employeeId, locationId } });

    if (!localBalance || forceRefresh || this.isStale(localBalance)) {
      try {
        const remote = await this.hcmClientService.getBalance(employeeId, locationId);
        return this.upsertFromSnapshot(remote, BalanceSyncEventType.REALTIME_PULL);
      } catch (error) {
        if (error instanceof HcmClientError && [400, 404].includes(error.status ?? 0)) {
          throw new BadRequestException('Invalid employee/location combination');
        }
        if (error instanceof HcmClientError) {
          throw new ConflictException('Unable to refresh balance from HCM');
        }
        throw error;
      }
    }

    return localBalance;
  }

  async upsertFromSnapshot(snapshot: BalanceSnapshot, source: BalanceSyncEventType): Promise<Balance> {
    let balance = await this.balanceRepository.findOne({
      where: { employeeId: snapshot.employeeId, locationId: snapshot.locationId },
    });

    if (!balance) {
      balance = this.balanceRepository.create({
        employeeId: snapshot.employeeId,
        locationId: snapshot.locationId,
        pendingDays: snapshot.pendingDays ?? 0,
        availableDays: snapshot.availableDays,
        version: snapshot.version ?? 1,
        lastSyncedAt: snapshot.lastSyncedAt ? new Date(snapshot.lastSyncedAt) : new Date(),
      });
    } else {
      balance.availableDays = snapshot.availableDays;
      if (typeof snapshot.pendingDays === 'number') {
        balance.pendingDays = snapshot.pendingDays;
      }
      balance.version = (snapshot.version ?? balance.version) + 1;
      balance.lastSyncedAt = snapshot.lastSyncedAt ? new Date(snapshot.lastSyncedAt) : new Date();
    }

    const saved = await this.balanceRepository.save(balance);
    await this.auditService.log('Balance', saved.id, `SYNC_${source}`, {
      employeeId: saved.employeeId,
      locationId: saved.locationId,
      availableDays: saved.availableDays,
      pendingDays: saved.pendingDays,
    });
    return saved;
  }

  async save(balance: Balance): Promise<Balance> {
    return this.balanceRepository.save(balance);
  }

  private isStale(balance: Balance): boolean {
    if (!balance.lastSyncedAt) {
      return true;
    }
    return Date.now() - balance.lastSyncedAt.getTime() > (this.options.balanceStaleMs ?? 60_000);
  }
}
