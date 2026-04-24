import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Like, Repository } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { BalancesService } from '../balances/balances.service';
import { BalanceSyncEventType } from '../common/enums';
import { mismatchDetected } from '../common/policies/time-off.policy';
import { BalanceSyncEvent } from '../entities/balance-sync-event.entity';
import { Balance } from '../entities/balance.entity';
import { HcmClientService } from '../hcm-client/hcm-client.service';

@Injectable()
export class SyncService {
  constructor(
    @InjectRepository(Balance)
    private readonly balanceRepository: Repository<Balance>,
    @InjectRepository(BalanceSyncEvent)
    private readonly syncEventRepository: Repository<BalanceSyncEvent>,
    private readonly balancesService: BalancesService,
    private readonly hcmClientService: HcmClientService,
    private readonly auditService: AuditService,
  ) {}

  async batchImportBalances(): Promise<{ imported: number }> {
    const snapshots = await this.hcmClientService.getBatchBalances();

    for (const snapshot of snapshots) {
      const saved = await this.balancesService.upsertFromSnapshot(snapshot, BalanceSyncEventType.BATCH_IMPORT);
      const mismatch = mismatchDetected(saved.availableDays, saved.pendingDays);
      await this.recordEvent(snapshot.employeeId, snapshot.locationId, BalanceSyncEventType.BATCH_IMPORT, {
        ...snapshot,
      }, {
        status: mismatch ? 'MISMATCH' : 'SYNCED',
        availableDays: saved.availableDays,
        pendingDays: saved.pendingDays,
      });
      if (mismatch) {
        await this.auditService.log('Balance', saved.id, 'BATCH_IMPORT_MISMATCH', {
          employeeId: saved.employeeId,
          locationId: saved.locationId,
        });
      }
    }

    return { imported: snapshots.length };
  }

  async reconcile(employeeId: number, locationId: number): Promise<{ mismatch: boolean; balance: Balance }> {
    const remote = await this.hcmClientService.getBalance(employeeId, locationId);
    const balance = await this.balancesService.upsertFromSnapshot(remote, BalanceSyncEventType.RECONCILIATION);
    const mismatch = mismatchDetected(balance.availableDays, balance.pendingDays);
    await this.recordEvent(employeeId, locationId, BalanceSyncEventType.RECONCILIATION, {
      ...remote,
    }, {
      status: mismatch ? 'MISMATCH' : 'RECONCILED',
      availableDays: balance.availableDays,
      pendingDays: balance.pendingDays,
    });
    return { mismatch, balance };
  }

  async reconcileAll(): Promise<{ reconciled: number }> {
    const balances = await this.balanceRepository.find();
    for (const balance of balances) {
      await this.reconcile(balance.employeeId, balance.locationId);
    }
    return { reconciled: balances.length };
  }

  async getMismatches(): Promise<BalanceSyncEvent[]> {
    return this.syncEventRepository.find({
      where: [{ result: Like('%"MISMATCH"%') }, { result: Like('%"REQUIRES_RECONCILIATION"%') }],
      order: { id: 'ASC' },
    });
  }

  private async recordEvent(
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
}
