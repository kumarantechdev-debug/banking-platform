# Customer Service

NestJS gRPC microservice for customer records. It uses MySQL through TypeORM;
database credentials are loaded from `.env` and schema synchronization is
disabled.

## Local setup

Set `DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_PASSWORD`, `DB_DATABASE`, and
`GRPC_PORT` in `.env`. Set `DB_DATABASE=customer_db`, create the configured
database, then apply pending migrations and start the service:

```powershell
npm run migration:run
npm run start:dev
```

The gRPC endpoint defaults to `0.0.0.0:50051` and uses plaintext locally.
Import `proto/customer.proto` into Postman, connect to `127.0.0.1:50051` with
TLS disabled, and choose `customer.CustomerService`. The service does not
register REST routes.

## Customer RPCs

- `CreateCustomer`: create a customer with `ACTIVE` status and a password,
  which is stored as a bcrypt hash.
- `VerifyCustomerCredentials`: verify a mobile/password pair. Invalid and
  unprovisioned credentials return the same authentication error.
- `GetCustomer`: fetch by positive integer ID.
- `GetCustomers`: filter by name, mobile, city, state, status, and creation
  date using `fromDate` and `toDate`; page defaults to 1, limit defaults to 10
  and is capped at 100. Sorting supports `createdAt`, `name`, `mobile`, `city`,
  `state`, and `status`. The response includes the matching customers, total count, page,
  limit, and total page count. Text filters use prefix matching; date-only
  bounds include their complete UTC calendar days.
- `UpdateCustomer`: partially update supplied customer fields.
- `DeleteCustomer`: delete a customer by ID.

## Migrations

```powershell
npm run migration:generate -- src/database/migrations/DescribeChange
npm run migration:run
npm run migration:revert
npm run migration:show
```

`migration:revert` reverts the most recently applied migration. Review generated
migrations before applying them to a database with existing data.

## Verification

```powershell
npm run build
npm test
npm run test:e2e
```
