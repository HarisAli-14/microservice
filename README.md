# Time-Off Microservice

NestJS + SQLite backend for time-off request lifecycle management with HCM-backed balance synchronization.

## Problem Statement
Employees request time off through the product, but the HCM remains the source of truth for balances and valid employment dimensions. That creates a synchronization challenge: the product needs to provide fast feedback and manage workflow state locally, while HCM balances may change independently due to refreshes, work anniversaries, or other systems. The service therefore has to combine local defensive validation with explicit HCM synchronization so approvals remain correct without making the workflow entirely dependent on HCM availability.

## Architecture Overview
The service is composed of six modules:

- `TimeOffRequestsModule`
  Handles request creation, lookup, approval, rejection, and cancellation.
- `BalancesModule`
  Owns local balance retrieval, stale refresh behavior, and sufficiency checks.
- `HcmMockModule`
  Runs as a separate server and simulates a realistic HCM with mutable state and failure modes.
- `HcmClientModule`
  Encapsulates outbound HTTP calls from the main service to the mock HCM.
- `SyncModule`
  Supports batch import, reconciliation, and mismatch inspection.
- `AuditModule`
  Stores audit events for lifecycle and integration actions.

The main service stores workflow state in SQLite, calls the mock HCM through HTTP for authoritative balance decisions, and uses sync plus reconciliation to recover from drift or failure.

## Why HCM is Mocked
The implementation intentionally does not integrate with real Workday or SAP because those systems are not available in this exercise and are explicitly out of scope. Instead, the repository includes a separate mock HCM server that simulates real integration behavior, including successful reads, invalid-dimension failures, insufficient-balance failures, external balance changes, timeouts, generic server failures, and broken validation mode. This allows the backend to be tested under realistic integration conditions rather than in-memory stubs.

## How to Run the App

```bash
npm install
npm run start
```

The main API listens on `http://127.0.0.1:3000`.

Run the mock HCM in a separate terminal:

```bash
npm run start:hcm
```

The mock HCM listens on `http://127.0.0.1:3001`.

## How to Run Tests

```bash
npm run test          # unit + integration
npm run test:e2e      # E2E against mock HCM
npm run test:cov      # coverage report
```

## API Examples

### `GET /balances/:employeeId/:locationId`

```bash
curl http://127.0.0.1:3000/balances/1/10
```

### `POST /time-off-requests`

```bash
curl -X POST http://127.0.0.1:3000/time-off-requests \
  -H "Content-Type: application/json" \
  -d "{\"employeeId\":1,\"locationId\":10,\"startDate\":\"2026-06-01\",\"endDate\":\"2026-06-02\",\"daysRequested\":2,\"idempotencyKey\":\"demo-request-1\"}"
```

### `GET /time-off-requests/:id`

```bash
curl http://127.0.0.1:3000/time-off-requests/1
```

### `POST /time-off-requests/:id/approve`

```bash
curl -X POST http://127.0.0.1:3000/time-off-requests/1/approve
```

### `POST /time-off-requests/:id/reject`

```bash
curl -X POST http://127.0.0.1:3000/time-off-requests/1/reject \
  -H "Content-Type: application/json" \
  -d "{\"rejectionReason\":\"Coverage constraints\"}"
```

### `POST /time-off-requests/:id/cancel`

```bash
curl -X POST http://127.0.0.1:3000/time-off-requests/1/cancel
```

### `POST /sync/hcm/batch-balances`

```bash
curl -X POST http://127.0.0.1:3000/sync/hcm/batch-balances
```

### `POST /sync/hcm/reconcile/:employeeId/:locationId`

```bash
curl -X POST http://127.0.0.1:3000/sync/hcm/reconcile/1/10
```

### `POST /sync/hcm/reconcile-all`

```bash
curl -X POST http://127.0.0.1:3000/sync/hcm/reconcile-all
```

### `GET /sync/hcm/mismatches`

```bash
curl http://127.0.0.1:3000/sync/hcm/mismatches
```

### `GET /mock-hcm/balances/:employeeId/:locationId`

```bash
curl http://127.0.0.1:3001/mock-hcm/balances/1/10
```

### `POST /mock-hcm/external-balance-change`

```bash
curl -X POST http://127.0.0.1:3001/mock-hcm/external-balance-change \
  -H "Content-Type: application/json" \
  -d "{\"employeeId\":1,\"locationId\":10,\"availableDays\":14}"
```

### `POST /mock-hcm/config/failure-mode`

```bash
curl -X POST http://127.0.0.1:3001/mock-hcm/config/failure-mode \
  -H "Content-Type: application/json" \
  -d "{\"mode\":\"TIMEOUT\"}"
```

### `POST /mock-hcm/config/validation-mode`

```bash
curl -X POST http://127.0.0.1:3001/mock-hcm/config/validation-mode \
  -H "Content-Type: application/json" \
  -d "{\"mode\":\"BROKEN\"}"
```

## Seed Data
- Ali: Karachi, 10 days available
- Sara: Karachi, 5 days available

Additional seeded dimensions:
- Employee `1`: Ali
- Employee `2`: Sara
- Location `10`: Karachi
- Location `20`: Lahore

## Edge Cases Handled
- Insufficient balance at request creation
- Stale local balance before approval
- External HCM balance changes before approval
- Invalid employee/location combinations
- HCM accepting invalid requests in broken validation mode
- Duplicate submissions with the same idempotency key
- Concurrent requests attempting to overspend the same balance
- HCM timeout and failure modes
- Batch sync conflicts with pending reservations
- Cancellation of approved requests
- Partial failures that require reconciliation

## Tradeoffs
The implementation uses a hybrid approach because neither HCM-only nor local-only behavior is acceptable. A purely local model is fast but unsafe because the HCM is authoritative and can change independently. A purely HCM-driven model is more consistent but degrades product responsiveness and couples every workflow action to HCM availability. The chosen design keeps a local cache for speed and workflow reservations, validates against HCM for correctness on important actions, and relies on reconciliation as the safety net for drift and failure.

## Coverage
Run:

```bash
npm run test:cov
```

Open:

[coverage/lcov-report/index.html](/D:/MERN/microservice/coverage/lcov-report/index.html)
