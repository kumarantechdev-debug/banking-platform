# Banking Service

Independent NestJS microservice exposing account and fund-transfer operations over gRPC. It persists accounts, transfers, and transfer audits in MySQL with TypeORM; it exposes no REST endpoints.

## Configuration

Create a local `.env` with the variables listed below. Keep its credentials private; `.env` is ignored by git. `CUSTOMER_PROTO_PATH` must point to the existing `customer.proto` contract from Customer Service; this service does not maintain a duplicate.

| Variable                     | Description                                               |
| ---------------------------- | --------------------------------------------------------- |
| `DB_HOST`, `DB_PORT`         | MySQL host and port                                       |
| `DB_USERNAME`, `DB_PASSWORD` | MySQL credentials                                         |
| `DB_DATABASE`                | Must be `banking_db`                                      |
| `CUSTOMER_SERVICE_URL`       | Customer Service gRPC address (default `127.0.0.1:50051`) |
| `CUSTOMER_PROTO_PATH`        | Path to Customer Service's existing proto                 |

Install dependencies with `npm install`. Migrations are stored in `src/database/migrations` and schema synchronization is disabled:

```bash
npm run migration:generate -- src/database/migrations/BankingSchema
npm run migration:run
npm run migration:revert
```

`synchronize` is disabled. Start the gRPC server on port `50052` with:

```bash
npm run start:dev
```

The gRPC contract is `proto/banking.proto` (`banking.BankingService`). The Nest build copies it to `dist/proto` for production startup.

## Operations and safety

- `CreateAccount` validates the customer through Customer Service before inserting an active account.
- Money values use decimal strings on the wire and integer minor units in application calculations.
- Transfers lock account rows in ascending ID order, update both balances, and persist the transfer and audit entries in one transaction.
- Transfer idempotency keys are unique. Replays return the original result; reuse with different transfer details is rejected.
- `GetAccountTransactionHistory` returns account-specific successful transfers, non-zero account-opening credits, date-boundary balances, and deterministic pagination. Account-opening credits have no transfer ID.
- Successful transfers append debit and credit ledger entries in the same database transaction as account balance updates.
- Successful transfers begin with settlement status `PENDING`; `GetPendingTransfers` returns up to 100 successful unsettled transfers per page using `afterTransferId`, and `UpdateTransferSettlementStatus` idempotently marks a transfer `SETTLED`.
- Authentication belongs at the API Gateway; the service accepts no client-supplied identity fields.

## Settlement integration

The settlement RPCs are part of `proto/banking.proto`. Apply the
`AddTransferSettlementStatus` migration with `npm run migration:run` before
starting settlement processing; the Banking gRPC server listens on port `50052`.

## Balance ledger cutover

Stop Banking Service writes before applying the new ledger migration, then run `npm run migration:run` against `banking_db` and restart the updated service. The migration records each existing account's balance as a baseline at cutover and does not change account or transfer rows. It deliberately does not backfill old transfers or infer older balances. Therefore, requests for a pre-baseline opening balance fail with `FAILED_PRECONDITION`; use an authoritative historical source if older statements are required.

Paginated history responses include a `snapshotAt` value. Pass it back on subsequent pages so all pages refer to the same ledger snapshot.

Run unit tests with `npm test` and create production output with `npm run build`.
