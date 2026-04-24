# Technical Requirement Document

## Overview
The Time-Off Microservice manages employee time-off requests while preserving balance integrity against an HCM source of truth. It exposes REST APIs for request lifecycle actions, local balance lookup, synchronization, reconciliation, and auditing. The implementation is built with NestJS and SQLite and includes a separate mock HCM server to simulate real integration behavior.

## Product Context
This service sits underneath an HR product such as ReadyOn or ExampleHR, where employees request time off through the product rather than directly in the HCM. The HCM remains the authoritative source for leave balances and valid employment dimensions, while the product layer owns workflow, user responsiveness, and managerial actions. Employees need fast and accurate feedback, and managers need approval decisions that are grounded in current data. The microservice therefore acts as a coordination layer between workflow state in the product and balance truth in HCM.

## Problem Statement
Keeping balances consistent between two systems is difficult because the product wants immediate local decisions while the HCM owns the authoritative balance. HCM balances can change independently through annual refreshes, work anniversaries, or other external systems, which means locally cached values can drift at any time. The service also cannot blindly trust the HCM to reject invalid requests because integrations may fail, time out, or validate inconsistently. The design therefore requires defensive local validation, explicit synchronization, and reconciliation paths that protect correctness without eliminating product responsiveness.

## Goals
- Allow employees to view balances by employee and location.
- Allow employees to create time-off requests with strong validation.
- Allow managers to approve or reject pending requests.
- Allow requests to be cancelled safely.
- Keep local balances synchronized with the HCM through real-time and batch flows.
- Detect mismatches and reconciliation conditions explicitly.
- Record important lifecycle and integration decisions in audit logs.
- Prevent duplicate submissions, stale approvals, overspending, and partial writes.

## Non-Goals
- No real integration with Workday, SAP, or any production HCM system.
- No frontend application as part of the required backend deliverable.
- No authentication or authorization implementation.
- No PTO accrual engine, payroll calculation, or holiday calendar logic.
- No distributed messaging or external queue infrastructure.

## Assumptions
- Balances are tracked per employee per location.
- The HCM is the source of truth for leave balances and valid dimension combinations.
- The HCM may not always validate correctly, so the service must perform defensive local validation.
- The mock HCM simulates realistic behavior by running as a separate HTTP server with mutable data and configurable failure modes.
- `daysRequested` is provided by the client and represents the amount of leave being requested.
- SQLite is acceptable for this implementation and its expected concurrency profile.

## Functional Requirements
- View local cached balance for a given employee and location.
- Create a time-off request after validating dimensions, dates, quantity, and idempotency.
- Approve a pending request after refreshing and revalidating the latest HCM balance.
- Reject a pending request and release reserved balance.
- Cancel a pending request locally.
- Cancel an approved request by reversing it in HCM and reconciling the local balance.
- Import the entire HCM balance corpus in batch mode and upsert local balance rows.
- Reconcile one employee/location pair or all local balances against HCM.
- Expose mismatch and reconciliation records through an API.
- Persist audit logs for all significant state transitions and integration actions.

## Non-Functional Requirements
- Correctness is the highest priority.
- Validation must be explicit and defensive.
- Write operations must avoid partial inconsistent state.
- Request creation must be idempotent using a client-provided key.
- The system must be safe under concurrent requests against the same balance.
- The test suite must provide strong regression protection and proof of coverage.
- API responses must use meaningful status codes and readable error payloads.
- The design should remain simple, readable, and modular.

## Architecture
The service is organized into six primary NestJS modules:

- `TimeOffRequestsModule`
  Handles request creation, lookup, approval, rejection, and cancellation.
- `BalancesModule`
  Owns local balance retrieval, stale-cache refresh logic, and balance persistence.
- `HcmMockModule`
  Runs as a separate NestJS application and simulates an HCM with configurable behavior.
- `HcmClientModule`
  Encapsulates outbound HTTP calls from the main service to the mock HCM.
- `SyncModule`
  Implements batch import, point reconciliation, global reconciliation, and mismatch retrieval.
- `AuditModule`
  Stores audit records for state changes and key system decisions.

Supporting infrastructure includes a TypeORM-based SQLite store, database seeding, and a testing reset module to restore seeded state.

## Data Model

### Employee
- `id`
- `externalEmployeeId`
- `name`

Represents an employee known to the service and mapped to an upstream HCM identity.

### Location
- `id`
- `externalLocationId`
- `name`

Represents a balance dimension, such as a work location, used to scope balances and request validity.

### Balance
- `id`
- `employeeId`
- `locationId`
- `availableDays`
- `pendingDays`
- `lastSyncedAt`
- `version`
- `createdAt`
- `updatedAt`

Stores the locally cached balance for a specific employee/location pair. `availableDays` reflects the last synchronized HCM value, while `pendingDays` reserves leave for locally pending requests.

### TimeOffRequest
- `id`
- `employeeId`
- `locationId`
- `startDate`
- `endDate`
- `daysRequested`
- `status`
- `idempotencyKey`
- `hcmReferenceId`
- `rejectionReason`
- `createdAt`
- `updatedAt`

Represents a time-off request owned by the product workflow. Status values include `PENDING`, `APPROVED`, `REJECTED`, `CANCELLED`, and `FAILED_SYNC`.

### BalanceSyncEvent
- `id`
- `employeeId`
- `locationId`
- `eventType`
- `payload`
- `result`
- `createdAt`

Captures integration-facing actions such as real-time pull, real-time push, batch import, and reconciliation outcomes.

### AuditLog
- `id`
- `entityType`
- `entityId`
- `action`
- `details`
- `createdAt`

Captures human-readable records of significant business decisions and state transitions.

## API Design

### Main Service APIs

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/balances/:employeeId/:locationId` | Return the local cached balance for an employee/location pair |
| `POST` | `/time-off-requests` | Create a pending time-off request |
| `GET` | `/time-off-requests/:id` | Retrieve a time-off request by ID |
| `POST` | `/time-off-requests/:id/approve` | Approve a pending request after HCM revalidation |
| `POST` | `/time-off-requests/:id/reject` | Reject a pending request and release pending balance |
| `POST` | `/time-off-requests/:id/cancel` | Cancel a pending or approved request |
| `POST` | `/sync/hcm/batch-balances` | Import the full HCM balance corpus |
| `POST` | `/sync/hcm/reconcile/:employeeId/:locationId` | Reconcile one employee/location pair with HCM |
| `POST` | `/sync/hcm/reconcile-all` | Reconcile all known local balances |
| `GET` | `/sync/hcm/mismatches` | Return mismatch and reconciliation records |

### Mock HCM APIs

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/mock-hcm/balances/:employeeId/:locationId` | Return HCM balance for a given employee/location pair |
| `POST` | `/mock-hcm/time-off` | Apply an approved time-off deduction in HCM |
| `DELETE` | `/mock-hcm/time-off/:hcmReferenceId` | Reverse an approved HCM time-off record |
| `GET` | `/mock-hcm/batch-balances` | Return the full HCM balance corpus |
| `POST` | `/mock-hcm/external-balance-change` | Simulate an external HCM balance change |
| `POST` | `/mock-hcm/config/failure-mode` | Enable timeout or general server failure behavior |
| `POST` | `/mock-hcm/config/validation-mode` | Configure normal, insufficient-balance, invalid-combination, or broken validation behavior |

## HCM Integration Strategy
The mock HCM runs as a real server on a separate port so the main service must integrate through HTTP rather than direct in-memory calls. `HcmClientModule` wraps those outbound calls and handles timeouts, server failures, invalid responses, and transport errors explicitly. The mock HCM supports configurable failure modes and a broken validation mode where it can incorrectly accept requests, which forces the main service to prove that it performs its own local validation instead of trusting external correctness. Real-time HCM calls are used for decisions that matter immediately, while batch sync and reconciliation provide recovery and drift correction.

## Request Lifecycle

### Create
1. Validate `employeeId`, `locationId`, `startDate`, `endDate`, `daysRequested`, and `idempotencyKey`.
2. Validate business rules:
   - `daysRequested` must be positive.
   - `startDate` must be on or before `endDate`.
   - employee/location must be valid.
3. Check whether a request already exists with the same `idempotencyKey`.
4. Load the local balance.
5. If the local balance is stale, fetch the latest HCM balance and update the local cache.
6. Validate that enough balance remains available.
7. Create the request as `PENDING`.
8. Increase `pendingDays` on the local balance.
9. Write an audit log entry.

### Approve
1. Reload the request and ensure it is `PENDING`.
2. Fetch the latest HCM balance before final approval.
3. Revalidate that the request still fits within available balance.
4. Call `POST /mock-hcm/time-off`.
5. If HCM succeeds:
   - mark the request `APPROVED`
   - store `hcmReferenceId`
   - reduce `availableDays`
   - reduce `pendingDays`
   - record audit and sync events
6. If HCM times out or fails:
   - preserve local integrity
   - keep the request safe or mark it `FAILED_SYNC` depending on failure boundary
   - avoid partial local corruption
7. Wrap the write path in a transaction.

### Reject
1. Reload the request and ensure it is `PENDING`.
2. Mark the request `REJECTED`.
3. Persist `rejectionReason`.
4. Release the reserved `pendingDays`.
5. Write an audit log.

### Cancel
1. Reload the request.
2. If it is `PENDING`:
   - mark `CANCELLED`
   - decrement `pendingDays`
   - audit the action
3. If it is `APPROVED`:
   - call `DELETE /mock-hcm/time-off/:hcmReferenceId`
   - if successful, restore `availableDays` and mark `CANCELLED`
   - if not successful, preserve consistency and record reconciliation follow-up
4. Disallow cancellation from invalid states.

## Sync Strategy
The sync design combines real-time pull with batch import:

- Real-time pull is used when local balances are stale or before a manager approval.
- Real-time push occurs when an approval is successfully written to HCM.
- Batch import pulls the full corpus from HCM and upserts local balance rows.

Local `pendingDays` are not ignored during batch sync. If a fresh HCM balance conflicts with pending reservations and creates an effectively negative local position, the service records a mismatch instead of silently overwriting the problem.

## Reconciliation Strategy
Reconciliation compares local cached balances with HCM balances for one employee/location pair or for all known balances. The service updates stale local rows, records a `BalanceSyncEvent`, and marks mismatches when refreshed HCM values conflict with local pending reservations or unresolved lifecycle state. The endpoint `GET /sync/hcm/mismatches` exposes those mismatch records for operational visibility.

## Edge Cases
- Insufficient balance during request creation
- Stale local balance before approval
- External HCM balance changes before approval
- Invalid employee/location combinations
- HCM accepting an invalid request in broken validation mode
- Duplicate request submission by idempotency key
- Concurrent requests competing for the same balance
- HCM timeout during approval
- Batch sync conflict with pending reservations
- Cancellation of an approved request
- Partial failure during HCM interaction

## Challenges
- Maintaining consistency across two systems with different ownership responsibilities
- Handling HCM unreliability and inconsistent external validation
- Preventing overspend under concurrent requests
- Avoiding stale-cache approvals
- Preserving fast product behavior while treating HCM as the source of truth

## Proposed Solution
The recommended design is hybrid. The service maintains a local balance cache for speed, workflow support, and reservation tracking, but it still consults HCM for authoritative validation at critical points such as approval. Batch sync and reconciliation act as a safety net for drift, independent HCM changes, and failure recovery. This balances responsiveness with correctness better than either extreme alternative.

## Alternatives Considered

### HCM-Only
This model would rely entirely on HCM for reads and writes. It improves consistency with the source of truth but makes the product slow, tightly coupled to HCM availability, and vulnerable to transient outages during normal workflow.

### Local-Only
This model would manage balances entirely inside the product. It is fast and operationally simple, but it is risky because HCM remains authoritative and may change independently, making local-only decisions unsafe.

### Hybrid
This model keeps a local cache for speed and workflow state while revalidating against HCM at key transitions and reconciling over time. It is the recommended option because it balances user experience, correctness, and recoverability.

## Testing Strategy
The service is validated through three layers:

- Unit tests
  Cover business rules such as sufficiency checks, invalid date handling, invalid quantity handling, idempotency reuse, state transition rules, and reconciliation detection.
- Integration tests
  Exercise module wiring, SQLite persistence, audit logging, stale refresh behavior, and request lifecycle flows.
- End-to-end tests
  Run against a separate mock HCM server and cover success cases, invalid dimensions, broken validation, external balance changes, duplicate submissions, concurrency, timeout handling, batch mismatch creation, and cancellation.

The objective is robust regression protection, not just isolated method coverage.

## Failure Handling
If HCM times out or fails during approval, the service preserves local correctness and keeps the request safe or marks it `FAILED_SYNC` rather than corrupting balances. Transactions prevent partial writes from leaving the request and balance in conflicting states. Sync and reconciliation records preserve evidence of mismatch and follow-up work. Audit logs capture all critical failures so operational troubleshooting does not depend solely on transient server logs.

## Future Improvements
- Add webhook support from HCM to reduce synchronization lag.
- Add real authentication and authorization.
- Add a retry queue for `FAILED_SYNC` requests.
- Introduce event-driven sync flows instead of relying primarily on pull-based reconciliation.
- Expand dimensional modeling beyond employee/location where leave policies require it.
