import { validate } from 'class-validator';
import { TimeOffRequestStatus } from '../../src/common/enums';
import {
  canTransitionFromPending,
  ensureSufficientBalance,
  mismatchDetected,
  validateDateRange,
  validateRequestedDays,
} from '../../src/common/policies/time-off.policy';
import { CreateTimeOffRequestDto } from '../../src/time-off-requests/dto/create-time-off-request.dto';

describe('time-off policy', () => {
  it('checks balance sufficiency', () => {
    expect(() => ensureSufficientBalance(5, 3)).not.toThrow();
    expect(() => ensureSufficientBalance(2, 3)).toThrow('Insufficient balance');
  });

  it('rejects invalid requested days', () => {
    expect(() => validateRequestedDays(0)).toThrow('daysRequested must be greater than 0');
  });

  it('rejects invalid date ranges', () => {
    expect(() => validateDateRange('2026-05-10', '2026-05-09')).toThrow('startDate must be on or before endDate');
  });

  it('enforces status transition rules', () => {
    expect(canTransitionFromPending(TimeOffRequestStatus.PENDING)).toBe(true);
    expect(canTransitionFromPending(TimeOffRequestStatus.APPROVED)).toBe(false);
  });

  it('detects reconciliation mismatches', () => {
    expect(mismatchDetected(3, 4)).toBe(true);
    expect(mismatchDetected(6, 1)).toBe(false);
  });

  it('validates dto fields', async () => {
    const dto = new CreateTimeOffRequestDto();
    dto.employeeId = 1;
    dto.locationId = 10;
    dto.startDate = 'not-a-date';
    dto.endDate = '2026-05-10';
    dto.daysRequested = -1;
    dto.idempotencyKey = '';

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });
});
