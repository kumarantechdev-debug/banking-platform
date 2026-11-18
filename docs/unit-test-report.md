# Banking Platform Unit Test Report

## Test Results at a Glance

| Module | Passed | Failed |
|---|---:|---:|
| Banking Service | 53 | 0 |
| Search Service | 19 | 0 |
| Settlement Service | 29 | 0 |
| **Total** | **101** | **0** |

## 1. Introduction

This report summarizes tests for the Banking Service fund transfers, Search
Service predictive search, and Settlement Service scheduled processing. The
tests check business rules, service responses, and selected interactions with
external systems before assessment or deployment.

The report distinguishes mocked unit tests from gRPC E2E tests, Redis
integration tests, and the standalone search performance benchmark. The
Gateway HTTP routes and a live MySQL concurrency scenario are outside the
verified test scope.

## 2. Fund Transfer — Banking Service

The transfer unit tests in
[transfers.service.spec.ts](../banking-service/src/transfers/transfers.service.spec.ts)
cover:

- Successful transfers, source and destination balances, transfer status,
  debit and credit ledger entries, and the initiation/completion audit trail.
- Invalid amounts, including zero and negative values, and invalid account IDs
  and idempotency keys.
- Insufficient funds, missing or inactive accounts, and destination balance
  limits; rejected transfers do not commit financial writes.
- Repeated matching idempotency keys, conflicting reuse, concurrent duplicate
  inserts, and failed-transfer retries.
- Competing transfers against a shared source balance: the mocked transaction
  harness serializes calls and verifies only one transfer succeeds, balances
  are not overdrawn, and pessimistic account locks are requested.
- Transfer retrieval by ID, including invalid and missing IDs.

The Banking Service gRPC E2E tests in
[banking.e2e-spec.ts](../banking-service/test/banking.e2e-spec.ts) verify the
`CreateTransfer` and `GetTransfer` RPC paths. They run an in-process gRPC
server with mocked service providers; they do not exercise a live database or
the Gateway HTTP route.

**Results:** 48 unit tests passed; 5 gRPC E2E tests passed.

## 3. Redis Predictive Search — Search Service

The Search Service unit tests in
[search.service.spec.ts](../search-service/src/search/search.service.spec.ts)
cover prefix search by customer name, city, state, and mobile; query
normalization; empty queries; no matches; unique results; and the response
shape. They verify the default result limit of 10 and the maximum effective
limit of 50.

The real-Redis integration test in
[search.redis.spec.ts](../search-service/src/search/search.redis.spec.ts)
executes the search Lua script against Redis sorted-set indexes and customer
hashes. It verifies matching across name, city, and state indexes, deduplication
when a customer matches multiple fields, and empty results. This test requires
`SEARCH_TEST_REDIS_URL` to point to a dedicated nonzero Redis database.

The seed test in
[seed-customers.spec.ts](../search-service/scripts/seed-customers.spec.ts)
verifies that the seed process queues 50,000 customer hashes and 50,000
members in each of the four indexes in batches. The actual
[seed-customers.ts](../search-service/scripts/seed-customers.ts) command was
also run against Redis; Redis reported 50,000 members for each index and
50,000 seed IDs.

The standalone benchmark in
[benchmark-search.ts](../search-service/scripts/benchmark-search.ts) sent 100
gRPC searches against the 50,000-record Redis dataset. It reports average and
maximum latency and fails if the maximum reaches 100 ms. The recorded result
was **19.74 ms average and 26.99 ms maximum**, below the target in this local
run.

**Results:** 19 tests passed in 4 suites. Strictly categorized, this is 18
unit tests and 1 Redis integration test; the benchmark is reported separately
and is not included in the test count.

## 4. Scheduled Settlement — Settlement Service

The scheduler tests in
[settlement.scheduler.spec.ts](../settlement-service/src/scheduler/settlement.scheduler.spec.ts)
verify:

- The daily cron expression is `0 01 * * *`, with the `Asia/Kolkata` timezone.
- Processing pending transfers in batches of 100, including a 101-transfer
  case that requires two fetches.
- Successful settlement updates, retry recovery, and avoiding duplicate
  processing of already successful transfers.
- One initial attempt followed by up to three retries; after four failed
  attempts the transaction and job are marked failed.
- Audit events for processing, retries, successful settlement, permanent
  failure, and job completion.
- A failed transaction appears in the failure report after retries are
  exhausted.

The
[failure-report.service.spec.ts](../settlement-service/src/reports/failure-report.service.spec.ts)
checks that reports include only failed transactions for the requested job.
The
[settlement-audit-log.service.spec.ts](../settlement-service/src/settlement-audit-log/settlement-audit-log.service.spec.ts)
checks that audit events are appended and prior records remain unchanged.
These tests mock persistence and the Banking Service client; they are not
database or remote-service integration tests.

**Results:** 29 unit tests passed.

## 5. Test Execution Summary

| Service | Unit tests | E2E tests | Integration tests | Total passed | Failed |
|---|---:|---:|---:|---:|---:|
| Banking Service | 48 | 5 | 0 | 53 | 0 |
| Search Service | 18 | 0 | 1 | 19 | 0 |
| Settlement Service | 29 | 0 | 0 | 29 | 0 |
| **Total** | **95** | **5** | **1** | **101** | **0** |

The Search Service's 19 passed tests include the one Redis integration test;
they are not all unit tests. The 100-request performance benchmark and live
seed command are separate validation activities, not additional Jest tests.

## 6. Test Commands

Run commands from the corresponding service directory. The `--runInBand`
option was used for the reported Jest runs.

### Banking Service

Package scripts: `npm test` and `npm run test:e2e`.

Executed:

```powershell
npm test -- --runInBand
npm run test:e2e -- --runInBand
```

### Search Service

Package scripts: `npm test`, `npm run seed:customers`, and
`npm run benchmark:search`.

The Redis integration test was run against a temporary Redis instance using
database 15:

```powershell
$env:SEARCH_TEST_REDIS_URL='redis://127.0.0.1:16379/15'; npm test -- --runInBand
```

The seed process and benchmark were run with:

```powershell
$env:REDIS_HOST='127.0.0.1'; $env:REDIS_PORT='16379'; npm run seed:customers
$env:GRPC_HOST='127.0.0.1'; $env:GRPC_PORT='15053'; npm run benchmark:search
```

### Settlement Service

Package script: `npm test`.

Executed:

```powershell
npm test -- --runInBand
```

## 7. Remaining Integration Gaps

- **Unauthenticated transfer POST:** Add a Gateway E2E test that sends the
  transfer POST without the authentication cookie and verifies HTTP 401. The
  Banking Service itself exposes gRPC, not an HTTP endpoint.
- **Real MySQL concurrency:** Run competing transfers against a live MySQL
  database and verify transaction locking prevents incorrect balances or
  overdrafts. The current concurrency test serializes mocked transactions.
