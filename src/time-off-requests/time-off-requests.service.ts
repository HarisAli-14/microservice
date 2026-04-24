import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { BalanceSyncEventType, TimeOffRequestStatus } from '../common/enums';
import {
  canTransitionFromPending,
  ensureSufficientBalance,
  validateDateRange,
  validateRequestedDays,
} from '../common/policies/time-off.policy';
import { BalancesService } from '../balances/balances.service';
import { BalanceSyncEvent } from '../entities/balance-sync-event.entity';
import { Balance } from '../entities/balance.entity';
import { TimeOffRequest } from '../entities/time-off-request.entity';
import { HcmClientError, HcmClientService } from '../hcm-client/hcm-client.service';
import { CreateTimeOffRequestDto } from './dto/create-time-off-request.dto';

@Injectable()
export class TimeOffRequestsService {
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(
    @InjectRepository(TimeOffRequest)
    private readonly requestRepository: Repository<TimeOffRequest>,
    @InjectRepository(Balance)
    private readonly balanceRepository: Repository<Balance>,
    @InjectRepository(BalanceSyncEvent)
    private readonly syncEventRepository: Repository<BalanceSyncEvent>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly balancesService: BalancesService,
    private readonly hcmClientService: HcmClientService,
    private readonly auditService: AuditService,
  ) {}

  async getById(id: number): Promise<TimeOffRequest> {
    const request = await this.requestRepository.findOne({ where: { id } });
    if (!request) {
      throw new NotFoundException('Time-off request not found');
    }
    return request;
  }

  async create(dto: CreateTimeOffRequestDto): Promise<TimeOffRequest> {
    validateRequestedDays(dto.daysRequested);
    validateDateRange(dto.startDate, dto.endDate);

    const existing = await this.requestRepository.findOne({ where: { idempotencyKey: dto.idempotencyKey } });
    if (existing) {
      return existing;
    }

    const latestBalance = await this.balancesService.getOrRefreshBalance(dto.employeeId, dto.locationId);
    ensureSufficientBalance(latestBalance.availableDays, dto.daysRequested);

    return this.runInImmediateTransaction(async (manager) => {
      const duplicate = await manager.findOne(TimeOffRequest, { where: { idempotencyKey: dto.idempotencyKey } });
      if (duplicate) {
        return duplicate;
      }

      const balance = await manager.findOne(Balance, {
        where: { employeeId: dto.employeeId, locationId: dto.locationId },
      });

      if (!balance) {
        throw new NotFoundException('Balance not found');
      }

      ensureSufficientBalance(balance.availableDays - balance.pendingDays, dto.daysRequested);
      balance.pendingDays += dto.daysRequested;
      balance.version += 1;
      await manager.save(balance);

      const request = await manager.save(
        manager.create(TimeOffRequest, {
          ...dto,
          status: TimeOffRequestStatus.PENDING,
          hcmReferenceId: null,
          rejectionReason: null,
        }),
      );

      await this.auditService.log('TimeOffRequest', request.id, 'CREATED', {
        employeeId: request.employeeId,
        locationId: request.locationId,
        daysRequested: request.daysRequested,
        idempotencyKey: request.idempotencyKey,
      });

      return request;
    });
  }

  async approve(id: number): Promise<TimeOffRequest> {
    const existingRequest = await this.getById(id);
    if (!canTransitionFromPending(existingRequest.status)) {
      throw new ConflictException('Only pending requests can be approved');
    }

    const hcmBalance = await this.balancesService.getOrRefreshBalance(existingRequest.employeeId, existingRequest.locationId, true);
    ensureSufficientBalance(hcmBalance.availableDays, existingRequest.daysRequested);

    return this.runInImmediateTransaction(async (manager) => {
      const request = await manager.findOne(TimeOffRequest, { where: { id } });
      if (!request) {
        throw new NotFoundException('Time-off request not found');
      }
      if (!canTransitionFromPending(request.status)) {
        throw new ConflictException('Only pending requests can be approved');
      }

      const currentBalance = await manager.findOne(Balance, {
        where: { employeeId: request.employeeId, locationId: request.locationId },
      });
      if (!currentBalance) {
        throw new NotFoundException('Balance not found');
      }

      try {
        const result = await this.hcmClientService.createTimeOff({
          employeeId: request.employeeId,
          locationId: request.locationId,
          startDate: request.startDate,
          endDate: request.endDate,
          daysRequested: request.daysRequested,
          idempotencyKey: request.idempotencyKey,
        });

        request.status = TimeOffRequestStatus.APPROVED;
        request.hcmReferenceId = result.hcmReferenceId;
        currentBalance.availableDays = result.availableDays;
        currentBalance.pendingDays -= request.daysRequested;
        currentBalance.version += 1;
        currentBalance.lastSyncedAt = new Date();

        await manager.save(currentBalance);
        await manager.save(request);
        await this.recordSyncEvent(request.employeeId, request.locationId, BalanceSyncEventType.REALTIME_PUSH, {
          requestId: request.id,
          hcmReferenceId: result.hcmReferenceId,
        }, {
          status: 'APPROVED',
          availableDays: result.availableDays,
        });
        await this.auditService.log('TimeOffRequest', request.id, 'APPROVED', {
          hcmReferenceId: request.hcmReferenceId,
          availableDays: currentBalance.availableDays,
        });
        return request;
      } catch (error) {
        if (error instanceof HcmClientError && (error.category === 'TIMEOUT' || (error.status ?? 500) >= 500)) {
          request.status = TimeOffRequestStatus.FAILED_SYNC;
          await manager.save(request);
          await this.auditService.log('TimeOffRequest', request.id, 'FAILED_SYNC', {
            reason: error.message,
          });
          throw new ConflictException('Approval failed due to HCM sync failure');
        }

        await this.auditService.log('TimeOffRequest', request.id, 'APPROVAL_BLOCKED', {
          reason: error instanceof Error ? error.message : 'Unknown HCM error',
        });
        throw new ConflictException('Approval rejected by HCM');
      }
    });
  }

  async reject(id: number, rejectionReason: string): Promise<TimeOffRequest> {
    return this.runInImmediateTransaction(async (manager) => {
      const request = await manager.findOne(TimeOffRequest, { where: { id } });
      if (!request) {
        throw new NotFoundException('Time-off request not found');
      }
      if (!canTransitionFromPending(request.status)) {
        throw new ConflictException('Only pending requests can be rejected');
      }

      const balance = await manager.findOne(Balance, {
        where: { employeeId: request.employeeId, locationId: request.locationId },
      });
      if (!balance) {
        throw new NotFoundException('Balance not found');
      }

      request.status = TimeOffRequestStatus.REJECTED;
      request.rejectionReason = rejectionReason;
      balance.pendingDays -= request.daysRequested;
      balance.version += 1;

      await manager.save(balance);
      await manager.save(request);
      await this.auditService.log('TimeOffRequest', request.id, 'REJECTED', { rejectionReason });
      return request;
    });
  }

  async cancel(id: number): Promise<TimeOffRequest> {
    return this.runInImmediateTransaction(async (manager) => {
      const request = await manager.findOne(TimeOffRequest, { where: { id } });
      if (!request) {
        throw new NotFoundException('Time-off request not found');
      }

      const balance = await manager.findOne(Balance, {
        where: { employeeId: request.employeeId, locationId: request.locationId },
      });
      if (!balance) {
        throw new NotFoundException('Balance not found');
      }

      if (request.status === TimeOffRequestStatus.PENDING) {
        request.status = TimeOffRequestStatus.CANCELLED;
        balance.pendingDays -= request.daysRequested;
        balance.version += 1;
        await manager.save(balance);
        await manager.save(request);
        await this.auditService.log('TimeOffRequest', request.id, 'CANCELLED_PENDING', {});
        return request;
      }

      if (request.status === TimeOffRequestStatus.APPROVED && request.hcmReferenceId) {
        try {
          const result = await this.hcmClientService.cancelTimeOff(request.hcmReferenceId);
          request.status = TimeOffRequestStatus.CANCELLED;
          balance.availableDays = result.availableDays;
          balance.version += 1;
          balance.lastSyncedAt = new Date();
          await manager.save(balance);
          await manager.save(request);
          await this.auditService.log('TimeOffRequest', request.id, 'CANCELLED_APPROVED', {
            hcmReferenceId: request.hcmReferenceId,
          });
          return request;
        } catch (error) {
          await this.recordSyncEvent(request.employeeId, request.locationId, BalanceSyncEventType.RECONCILIATION, {
            requestId: request.id,
            hcmReferenceId: request.hcmReferenceId,
          }, {
            status: 'REQUIRES_RECONCILIATION',
            reason: error instanceof Error ? error.message : 'Unknown cancellation failure',
          });
          await this.auditService.log('TimeOffRequest', request.id, 'CANCELLATION_REQUIRES_RECONCILIATION', {});
          throw new ConflictException('Approved request cancellation requires reconciliation');
        }
      }

      throw new ConflictException('Only pending or approved requests can be cancelled');
    });
  }

  private async recordSyncEvent(
    employeeId: number,
    locationId: number,
    eventType: BalanceSyncEventType,
    payload: Record<string, unknown>,
    result: Record<string, unknown>,
  ): Promise<void> {
    await this.syncEventRepository.save(
      this.syncEventRepository.create({
        employeeId,
        locationId,
        eventType,
        payload: JSON.stringify(payload),
        result: JSON.stringify(result),
      }),
    );
  }

  private async runInImmediateTransaction<T>(work: (manager: EntityManager) => Promise<T>): Promise<T> {
    const run = this.writeQueue.then(() => this.dataSource.transaction((manager) => work(manager)));
    this.writeQueue = run.then(() => undefined, () => undefined);
    return run;
  }
}
