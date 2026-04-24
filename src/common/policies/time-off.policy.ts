import { BadRequestException, ConflictException } from '@nestjs/common';
import { TimeOffRequestStatus } from '../enums';

export function validateRequestedDays(daysRequested: number): void {
  if (!Number.isFinite(daysRequested) || daysRequested <= 0) {
    throw new BadRequestException('daysRequested must be greater than 0');
  }
}

export function validateDateRange(startDate: string, endDate: string): void {
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new BadRequestException('startDate and endDate must be valid ISO dates');
  }
  if (start > end) {
    throw new BadRequestException('startDate must be on or before endDate');
  }
}

export function ensureSufficientBalance(availableDays: number, daysRequested: number): void {
  if (availableDays < daysRequested) {
    throw new ConflictException('Insufficient balance');
  }
}

export function canTransitionFromPending(status: TimeOffRequestStatus): boolean {
  return status === TimeOffRequestStatus.PENDING;
}

export function mismatchDetected(availableDays: number, pendingDays: number): boolean {
  return availableDays - pendingDays < 0;
}
