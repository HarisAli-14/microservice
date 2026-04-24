import { Repository } from 'typeorm';
import { TimeOffRequestStatus } from '../../src/common/enums';
import { TimeOffRequest } from '../../src/entities/time-off-request.entity';
import { TimeOffRequestsService } from '../../src/time-off-requests/time-off-requests.service';

describe('TimeOffRequestsService', () => {
  it('returns existing request for a duplicate idempotency key', async () => {
    const existing: TimeOffRequest = {
      id: 99,
      employeeId: 1,
      locationId: 10,
      startDate: '2026-05-10',
      endDate: '2026-05-12',
      daysRequested: 2,
      status: TimeOffRequestStatus.PENDING,
      idempotencyKey: 'same-key',
      hcmReferenceId: null,
      rejectionReason: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const requestRepository = {
      findOne: jest.fn().mockResolvedValue(existing),
    } as unknown as Repository<TimeOffRequest>;

    const service = new TimeOffRequestsService(
      requestRepository,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    const result = await service.create({
      employeeId: 1,
      locationId: 10,
      startDate: '2026-05-10',
      endDate: '2026-05-12',
      daysRequested: 2,
      idempotencyKey: 'same-key',
    });

    expect(result).toBe(existing);
    expect(requestRepository.findOne).toHaveBeenCalledWith({ where: { idempotencyKey: 'same-key' } });
  });
});
