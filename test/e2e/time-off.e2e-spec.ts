import request from 'supertest';
import { DataSource } from 'typeorm';
import { BalanceSyncEvent } from '../../src/entities/balance-sync-event.entity';
import { Balance } from '../../src/entities/balance.entity';
import { closeApps, createHcmServer, createMainApp } from '../test-app';

describe('time-off e2e', () => {
  let hcm: Awaited<ReturnType<typeof createHcmServer>>;
  let main: Awaited<ReturnType<typeof createMainApp>>;
  let dataSource: DataSource;

  beforeEach(async () => {
    hcm = await createHcmServer();
    main = await createMainApp(`e2e-${Date.now()}`, hcm.baseUrl, true);
    dataSource = main.dataSource;
  });

  afterEach(async () => {
    await closeApps(main?.app, hcm?.app);
  });

  it('employee has enough balance and request succeeds', async () => {
    await request(main.app.getHttpServer())
      .post('/time-off-requests')
      .send({
        employeeId: 1,
        locationId: 10,
        startDate: '2026-06-01',
        endDate: '2026-06-02',
        daysRequested: 2,
        idempotencyKey: 'e2e-enough-balance',
      })
      .expect(201);
  });

  it('employee has insufficient balance and request is rejected', async () => {
    await request(main.app.getHttpServer())
      .post('/time-off-requests')
      .send({
        employeeId: 2,
        locationId: 10,
        startDate: '2026-06-01',
        endDate: '2026-06-02',
        daysRequested: 6,
        idempotencyKey: 'e2e-insufficient',
      })
      .expect(409);
  });

  it('invalid employee/location combination is rejected', async () => {
    await request(main.app.getHttpServer())
      .post('/time-off-requests')
      .send({
        employeeId: 1,
        locationId: 20,
        startDate: '2026-06-01',
        endDate: '2026-06-02',
        daysRequested: 1,
        idempotencyKey: 'e2e-invalid-combo',
      })
      .expect(400);
  });

  it('hcm rejects approval and service handles it safely', async () => {
    const created = await request(main.app.getHttpServer())
      .post('/time-off-requests')
      .send({
        employeeId: 1,
        locationId: 10,
        startDate: '2026-06-03',
        endDate: '2026-06-04',
        daysRequested: 2,
        idempotencyKey: 'e2e-approve-reject',
      })
      .expect(201);

    await request(hcm.app.getHttpServer())
      .post('/mock-hcm/config/validation-mode')
      .send({ mode: 'INSUFFICIENT_BALANCE' })
      .expect(201);

    await request(main.app.getHttpServer())
      .post(`/time-off-requests/${created.body.id}/approve`)
      .send({})
      .expect(409);
  });

  it('hcm wrongly accepts invalid request but local validation blocks it', async () => {
    await request(hcm.app.getHttpServer())
      .post('/mock-hcm/config/validation-mode')
      .send({ mode: 'BROKEN' })
      .expect(201);

    await request(main.app.getHttpServer())
      .post('/time-off-requests')
      .send({
        employeeId: 2,
        locationId: 10,
        startDate: '2026-06-05',
        endDate: '2026-06-06',
        daysRequested: 99,
        idempotencyKey: 'e2e-broken-hcm',
      })
      .expect(409);
  });

  it('manager revalidates after external balance change before approval', async () => {
    const created = await request(main.app.getHttpServer())
      .post('/time-off-requests')
      .send({
        employeeId: 1,
        locationId: 10,
        startDate: '2026-06-05',
        endDate: '2026-06-06',
        daysRequested: 6,
        idempotencyKey: 'e2e-revalidate',
      })
      .expect(201);

    await request(hcm.app.getHttpServer())
      .post('/mock-hcm/external-balance-change')
      .send({ employeeId: 1, locationId: 10, availableDays: 4 })
      .expect(201);

    await request(main.app.getHttpServer())
      .post(`/time-off-requests/${created.body.id}/approve`)
      .send({})
      .expect(409);
  });

  it('duplicate request with same idempotency key returns same request', async () => {
    const payload = {
      employeeId: 1,
      locationId: 10,
      startDate: '2026-06-07',
      endDate: '2026-06-07',
      daysRequested: 1,
      idempotencyKey: 'e2e-idempotent',
    };

    const first = await request(main.app.getHttpServer()).post('/time-off-requests').send(payload).expect(201);
    const second = await request(main.app.getHttpServer()).post('/time-off-requests').send(payload).expect(201);
    expect(second.body.id).toBe(first.body.id);
  });

  it('two simultaneous requests cannot overspend balance', async () => {
    const payloadA = {
      employeeId: 2,
      locationId: 10,
      startDate: '2026-06-08',
      endDate: '2026-06-08',
      daysRequested: 4,
      idempotencyKey: 'e2e-concurrency-a',
    };
    const payloadB = {
      ...payloadA,
      idempotencyKey: 'e2e-concurrency-b',
    };

    const [first, second] = await Promise.allSettled([
      request(main.app.getHttpServer()).post('/time-off-requests').send(payloadA),
      request(main.app.getHttpServer()).post('/time-off-requests').send(payloadB),
    ]);

    const statuses = [first, second].map((result) =>
      result.status === 'fulfilled' ? result.value.statusCode : 500,
    ).sort();

    expect(statuses).toEqual([201, 409]);
  });

  it('hcm timeout is handled safely with no data corruption', async () => {
    const created = await request(main.app.getHttpServer())
      .post('/time-off-requests')
      .send({
        employeeId: 1,
        locationId: 10,
        startDate: '2026-06-09',
        endDate: '2026-06-10',
        daysRequested: 2,
        idempotencyKey: 'e2e-timeout',
      })
      .expect(201);

    await request(hcm.app.getHttpServer())
      .post('/mock-hcm/config/failure-mode')
      .send({ mode: 'TIMEOUT' })
      .expect(201);

    await request(main.app.getHttpServer())
      .post(`/time-off-requests/${created.body.id}/approve`)
      .send({})
      .expect(409);

    const requestRow = await dataSource.getRepository(Balance).findOneByOrFail({ employeeId: 1, locationId: 10 });
    expect(requestRow.pendingDays).toBe(2);
    expect(requestRow.availableDays).toBe(10);
  });

  it('batch sync creates mismatch event when pending conflicts with hcm balance', async () => {
    await request(main.app.getHttpServer())
      .post('/time-off-requests')
      .send({
        employeeId: 1,
        locationId: 10,
        startDate: '2026-06-11',
        endDate: '2026-06-12',
        daysRequested: 8,
        idempotencyKey: 'e2e-mismatch',
      })
      .expect(201);

    await request(hcm.app.getHttpServer())
      .post('/mock-hcm/external-balance-change')
      .send({ employeeId: 1, locationId: 10, availableDays: 4 })
      .expect(201);

    await request(main.app.getHttpServer())
      .post('/sync/hcm/batch-balances')
      .send({})
      .expect(201);

    const mismatches = await dataSource.getRepository(BalanceSyncEvent).find();
    expect(mismatches.some((event) => event.result.includes('MISMATCH'))).toBe(true);
  });

  it('cancellation flow works end to end', async () => {
    const created = await request(main.app.getHttpServer())
      .post('/time-off-requests')
      .send({
        employeeId: 1,
        locationId: 10,
        startDate: '2026-06-13',
        endDate: '2026-06-14',
        daysRequested: 2,
        idempotencyKey: 'e2e-cancel-end-to-end',
      })
      .expect(201);

    await request(main.app.getHttpServer())
      .post(`/time-off-requests/${created.body.id}/approve`)
      .send({})
      .expect(201);

    await request(main.app.getHttpServer())
      .post(`/time-off-requests/${created.body.id}/cancel`)
      .send({})
      .expect(201);

    const balance = await dataSource.getRepository(Balance).findOneByOrFail({ employeeId: 1, locationId: 10 });
    expect(balance.availableDays).toBe(10);
  });
});
