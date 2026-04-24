import request from 'supertest';
import { DataSource } from 'typeorm';
import { AuditLog } from '../../src/entities/audit-log.entity';
import { Balance } from '../../src/entities/balance.entity';
import { TimeOffRequest } from '../../src/entities/time-off-request.entity';
import { closeApps, createHcmServer, createMainApp } from '../test-app';

describe('time-off integration', () => {
  let hcm: Awaited<ReturnType<typeof createHcmServer>>;
  let main: Awaited<ReturnType<typeof createMainApp>>;
  let dataSource: DataSource;

  beforeEach(async () => {
    hcm = await createHcmServer();
    main = await createMainApp(`integration-${Date.now()}`, hcm.baseUrl);
    dataSource = main.dataSource;
  });

  afterEach(async () => {
    await closeApps(main?.app, hcm?.app);
  });

  it('creates a request successfully', async () => {
    const response = await request(main.app.getHttpServer())
      .post('/time-off-requests')
      .send({
        employeeId: 1,
        locationId: 10,
        startDate: '2026-05-01',
        endDate: '2026-05-02',
        daysRequested: 2,
        idempotencyKey: 'create-success',
      })
      .expect(201);

    expect(response.body.status).toBe('PENDING');
    const balance = await dataSource.getRepository(Balance).findOneByOrFail({ employeeId: 1, locationId: 10 });
    expect(balance.pendingDays).toBe(2);
  });

  it('rejects insufficient balance on create', async () => {
    await request(main.app.getHttpServer())
      .post('/time-off-requests')
      .send({
        employeeId: 2,
        locationId: 10,
        startDate: '2026-05-01',
        endDate: '2026-05-10',
        daysRequested: 8,
        idempotencyKey: 'insufficient-create',
      })
      .expect(409);
  });

  it('approves a request successfully', async () => {
    const created = await request(main.app.getHttpServer())
      .post('/time-off-requests')
      .send({
        employeeId: 1,
        locationId: 10,
        startDate: '2026-05-01',
        endDate: '2026-05-02',
        daysRequested: 2,
        idempotencyKey: 'approve-success',
      })
      .expect(201);

    const approved = await request(main.app.getHttpServer())
      .post(`/time-off-requests/${created.body.id}/approve`)
      .send({})
      .expect(201);

    expect(approved.body.status).toBe('APPROVED');
    const balance = await dataSource.getRepository(Balance).findOneByOrFail({ employeeId: 1, locationId: 10 });
    expect(balance.availableDays).toBe(8);
    expect(balance.pendingDays).toBe(0);
  });

  it('rejecting a request releases pending days', async () => {
    const created = await request(main.app.getHttpServer())
      .post('/time-off-requests')
      .send({
        employeeId: 1,
        locationId: 10,
        startDate: '2026-05-03',
        endDate: '2026-05-04',
        daysRequested: 2,
        idempotencyKey: 'reject-flow',
      })
      .expect(201);

    await request(main.app.getHttpServer())
      .post(`/time-off-requests/${created.body.id}/reject`)
      .send({ rejectionReason: 'Staffing' })
      .expect(201);

    const balance = await dataSource.getRepository(Balance).findOneByOrFail({ employeeId: 1, locationId: 10 });
    expect(balance.pendingDays).toBe(0);
  });

  it('cancelling a pending request releases pending days', async () => {
    const created = await request(main.app.getHttpServer())
      .post('/time-off-requests')
      .send({
        employeeId: 1,
        locationId: 10,
        startDate: '2026-05-05',
        endDate: '2026-05-06',
        daysRequested: 2,
        idempotencyKey: 'cancel-pending-flow',
      })
      .expect(201);

    await request(main.app.getHttpServer())
      .post(`/time-off-requests/${created.body.id}/cancel`)
      .send({})
      .expect(201);

    const balance = await dataSource.getRepository(Balance).findOneByOrFail({ employeeId: 1, locationId: 10 });
    expect(balance.pendingDays).toBe(0);
  });

  it('batch sync updates balances', async () => {
    await request(hcm.app.getHttpServer())
      .post('/mock-hcm/external-balance-change')
      .send({ employeeId: 1, locationId: 10, availableDays: 14 })
      .expect(201);

    await request(main.app.getHttpServer())
      .post('/sync/hcm/batch-balances')
      .send({})
      .expect(201);

    const balance = await dataSource.getRepository(Balance).findOneByOrFail({ employeeId: 1, locationId: 10 });
    expect(balance.availableDays).toBe(14);
  });

  it('stale local balance refreshes from hcm', async () => {
    const balanceRepo = dataSource.getRepository(Balance);
    const balance = await balanceRepo.findOneByOrFail({ employeeId: 1, locationId: 10 });
    balance.lastSyncedAt = new Date(Date.now() - 60_000);
    await balanceRepo.save(balance);

    await request(hcm.app.getHttpServer())
      .post('/mock-hcm/external-balance-change')
      .send({ employeeId: 1, locationId: 10, availableDays: 12 })
      .expect(201);

    await request(main.app.getHttpServer())
      .post('/time-off-requests')
      .send({
        employeeId: 1,
        locationId: 10,
        startDate: '2026-05-07',
        endDate: '2026-05-07',
        daysRequested: 2,
        idempotencyKey: 'stale-refresh',
      })
      .expect(201);

    const refreshed = await balanceRepo.findOneByOrFail({ employeeId: 1, locationId: 10 });
    expect(refreshed.availableDays).toBe(12);
    expect(refreshed.pendingDays).toBe(2);
  });

  it('creates audit logs', async () => {
    await request(main.app.getHttpServer())
      .post('/time-off-requests')
      .send({
        employeeId: 1,
        locationId: 10,
        startDate: '2026-05-11',
        endDate: '2026-05-11',
        daysRequested: 1,
        idempotencyKey: 'audit-log-flow',
      })
      .expect(201);

    const audits = await dataSource.getRepository(AuditLog).find();
    expect(audits.length).toBeGreaterThan(0);
  });
});
