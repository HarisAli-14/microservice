export interface AppOptions {
  databasePath?: string;
  hcmBaseUrl?: string;
  balanceStaleMs?: number;
}

export interface BalanceSnapshot {
  employeeId: number;
  locationId: number;
  availableDays: number;
  pendingDays?: number;
  version?: number;
  lastSyncedAt?: string;
}
