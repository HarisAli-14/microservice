import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { HcmFailureMode, HcmValidationMode } from '../common/enums';
import { MockTimeOffDto } from './dto/mock-time-off.dto';
import { ExternalBalanceChangeDto } from './dto/external-balance-change.dto';

type HcmBalanceRecord = {
  employeeId: number;
  locationId: number;
  availableDays: number;
  lastSyncedAt: string;
  version: number;
};

type ApprovedRecord = {
  hcmReferenceId: string;
  employeeId: number;
  locationId: number;
  daysRequested: number;
};

@Injectable()
export class HcmMockService {
  private readonly employees = new Set([1, 2]);
  private readonly locations = new Set([10, 20]);
  private readonly balances = new Map<string, HcmBalanceRecord>();
  private readonly approvals = new Map<string, ApprovedRecord>();
  private failureMode = HcmFailureMode.NORMAL;
  private validationMode = HcmValidationMode.NORMAL;

  constructor() {
    this.reset();
  }

  reset(): void {
    this.balances.clear();
    this.approvals.clear();
    this.failureMode = HcmFailureMode.NORMAL;
    this.validationMode = HcmValidationMode.NORMAL;
    this.setBalance(1, 10, 10);
    this.setBalance(2, 10, 5);
  }

  resetState(): { status: string } {
    this.reset();
    return { status: 'reset' };
  }

  async getBalance(employeeId: number, locationId: number): Promise<HcmBalanceRecord> {
    await this.applyFailureMode();
    this.ensureKnownCombination(employeeId, locationId);
    return this.getRecord(employeeId, locationId);
  }

  async createTimeOff(body: MockTimeOffDto): Promise<{ hcmReferenceId: string; availableDays: number }> {
    await this.applyFailureMode();

    if (this.validationMode !== HcmValidationMode.BROKEN) {
      this.ensureKnownCombination(body.employeeId, body.locationId);
    }

    const record = this.balances.get(this.key(body.employeeId, body.locationId))
      ?? this.createSyntheticBalance(body.employeeId, body.locationId);

    if (this.validationMode === HcmValidationMode.INVALID_COMBINATION) {
      throw new BadRequestException('Invalid employee/location combination');
    }

    if (this.validationMode === HcmValidationMode.INSUFFICIENT_BALANCE) {
      throw new ConflictException('HCM reports insufficient balance');
    }

    if (this.validationMode !== HcmValidationMode.BROKEN && record.availableDays < body.daysRequested) {
      throw new ConflictException('Insufficient balance');
    }

    record.availableDays -= body.daysRequested;
    record.version += 1;
    record.lastSyncedAt = new Date().toISOString();

    const hcmReferenceId = `HCM-${body.employeeId}-${body.locationId}-${record.version}`;
    this.approvals.set(hcmReferenceId, {
      hcmReferenceId,
      employeeId: body.employeeId,
      locationId: body.locationId,
      daysRequested: body.daysRequested,
    });

    this.balances.set(this.key(body.employeeId, body.locationId), record);
    return { hcmReferenceId, availableDays: record.availableDays };
  }

  async cancelTimeOff(hcmReferenceId: string): Promise<{ availableDays: number }> {
    await this.applyFailureMode();
    const approval = this.approvals.get(hcmReferenceId);
    if (!approval) {
      throw new NotFoundException('HCM reference not found');
    }

    const record = this.getRecord(approval.employeeId, approval.locationId);
    record.availableDays += approval.daysRequested;
    record.version += 1;
    record.lastSyncedAt = new Date().toISOString();
    this.approvals.delete(hcmReferenceId);
    return { availableDays: record.availableDays };
  }

  async getBatchBalances(): Promise<HcmBalanceRecord[]> {
    await this.applyFailureMode();
    return [...this.balances.values()].map((balance) => ({ ...balance }));
  }

  async externalBalanceChange(body: ExternalBalanceChangeDto): Promise<HcmBalanceRecord> {
    const record = this.getRecord(body.employeeId, body.locationId);
    record.availableDays = typeof body.availableDays === 'number'
      ? body.availableDays
      : record.availableDays + (body.deltaDays ?? 0);
    record.version += 1;
    record.lastSyncedAt = new Date().toISOString();
    return record;
  }

  setFailureMode(mode: HcmFailureMode): { mode: HcmFailureMode } {
    this.failureMode = mode;
    return { mode };
  }

  setValidationMode(mode: HcmValidationMode): { mode: HcmValidationMode } {
    this.validationMode = mode;
    return { mode };
  }

  private ensureKnownCombination(employeeId: number, locationId: number): void {
    if (this.validationMode === HcmValidationMode.INVALID_COMBINATION) {
      throw new BadRequestException('Invalid employee/location combination');
    }

    const exists = this.employees.has(employeeId) && this.locations.has(locationId) && this.balances.has(this.key(employeeId, locationId));
    if (!exists) {
      throw new BadRequestException('Invalid employee/location combination');
    }
  }

  private getRecord(employeeId: number, locationId: number): HcmBalanceRecord {
    const record = this.balances.get(this.key(employeeId, locationId));
    if (!record) {
      throw new BadRequestException('Invalid employee/location combination');
    }
    return record;
  }

  private key(employeeId: number, locationId: number): string {
    return `${employeeId}:${locationId}`;
  }

  private setBalance(employeeId: number, locationId: number, availableDays: number): void {
    this.balances.set(this.key(employeeId, locationId), {
      employeeId,
      locationId,
      availableDays,
      lastSyncedAt: new Date().toISOString(),
      version: 1,
    });
  }

  private createSyntheticBalance(employeeId: number, locationId: number): HcmBalanceRecord {
    const record: HcmBalanceRecord = {
      employeeId,
      locationId,
      availableDays: 0,
      lastSyncedAt: new Date().toISOString(),
      version: 1,
    };
    this.balances.set(this.key(employeeId, locationId), record);
    return record;
  }

  private async applyFailureMode(): Promise<void> {
    if (this.failureMode === HcmFailureMode.TIMEOUT) {
      await new Promise((resolve) => setTimeout(resolve, 2_000));
      return;
    }
    if (this.failureMode === HcmFailureMode.ERROR) {
      throw new ServiceUnavailableException('Mock HCM failure mode active');
    }
  }
}
