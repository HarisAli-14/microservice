import { Inject, Injectable } from '@nestjs/common';
import { APP_OPTIONS } from '../common/constants';
import { AppOptions, BalanceSnapshot } from '../common/types';

export class HcmClientError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly body?: Record<string, unknown>,
    readonly category: 'HTTP' | 'TIMEOUT' | 'NETWORK' = 'HTTP',
  ) {
    super(message);
  }
}

@Injectable()
export class HcmClientService {
  constructor(
    @Inject(APP_OPTIONS)
    private readonly options: AppOptions,
  ) {}

  async getBalance(employeeId: number, locationId: number): Promise<BalanceSnapshot> {
    return this.request<BalanceSnapshot>(`/mock-hcm/balances/${employeeId}/${locationId}`);
  }

  async createTimeOff(payload: {
    employeeId: number;
    locationId: number;
    startDate: string;
    endDate: string;
    daysRequested: number;
    idempotencyKey: string;
  }): Promise<{ hcmReferenceId: string; availableDays: number }> {
    return this.request('/mock-hcm/time-off', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async cancelTimeOff(hcmReferenceId: string): Promise<{ availableDays: number }> {
    return this.request(`/mock-hcm/time-off/${hcmReferenceId}`, {
      method: 'DELETE',
    });
  }

  async getBatchBalances(): Promise<BalanceSnapshot[]> {
    return this.request<BalanceSnapshot[]>('/mock-hcm/batch-balances');
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1_250);
    try {
      const response = await fetch(`${this.options.hcmBaseUrl}${path}`, {
        ...init,
        headers: {
          'content-type': 'application/json',
          ...(init.headers ?? {}),
        },
        signal: controller.signal,
      });

      const text = await response.text();
      const body = text ? (JSON.parse(text) as Record<string, unknown>) : {};

      if (!response.ok) {
        throw new HcmClientError((body.message as string) ?? 'HCM request failed', response.status, body);
      }

      return body as T;
    } catch (error) {
      if (error instanceof HcmClientError) {
        throw error;
      }
      if (error instanceof Error && error.name === 'AbortError') {
        throw new HcmClientError('HCM timeout', undefined, undefined, 'TIMEOUT');
      }
      throw new HcmClientError('HCM network failure', undefined, undefined, 'NETWORK');
    } finally {
      clearTimeout(timeout);
    }
  }
}
