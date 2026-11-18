# Banking API Gateway

The HTTP entry point for the Banking Customer and Fund Transfer Platform. The
gateway exposes REST endpoints and forwards requests to the Customer, Banking,
Search, Statement, and Settlement gRPC services.

## Run locally

```bash
npm install
npm run start:dev
```

Edit `.env` to override the defaults:

| Variable | Default | Description |
| --- | --- | --- |
| `PORT` | `3000` | HTTP port |
| `CORS_ORIGIN` | `http://localhost:5173` | Comma-separated allowed origins; credentials are enabled |
| `CUSTOMER_GRPC_HOST` / `CUSTOMER_GRPC_PORT` | `localhost` / `50051` | Customer Service |
| `BANKING_GRPC_HOST` / `BANKING_GRPC_PORT` | `localhost` / `50052` | Banking Service |
| `SEARCH_GRPC_HOST` / `SEARCH_GRPC_PORT` | `localhost` / `50053` | Search Service |
| `STATEMENT_GRPC_HOST` / `STATEMENT_GRPC_PORT` | `localhost` / `50054` | Statement Service |
| `SETTLEMENT_GRPC_HOST` / `SETTLEMENT_GRPC_PORT` | `localhost` / `50055` | Settlement Service |
| `JWT_SECRET` | required | Secret used to sign and verify access tokens; keep it private and use at least 32 random bytes |
| `JWT_EXPIRES_IN` | `15m` | Access token lifetime, in a `jsonwebtoken` duration format |

Generate a secret locally and place it in `.env`:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

## API

- `GET /api/health` returns the gateway status.
- `POST /api/auth/login` verifies a customer's mobile and password through the
  Customer Service and returns a JWT bearer token.
- Customer, banking, search, statement, and settlement endpoints require
  `Authorization: Bearer <accessToken>`. Health and login remain public.
- `POST /api/customers` accepts name, mobile, city, state, and password;
  Customer Service hashes the password. `GET /api/customers`,
  `GET /api/customers/:id`
- `GET /api/search/customers?q=...`
- `POST /api/accounts`, `GET /api/accounts/:id`
- `POST /api/transfers`, `GET /api/transfers/:id`
- `POST /api/statements`, `GET /api/statements/:id`
- `POST /api/settlements`, `POST /api/settlements/:id/process`,
  `GET /api/settlements/:id`
- Swagger UI is available at `/api/docs`.

Request DTOs use `class-validator` and `class-transformer`. gRPC status codes
are translated to HTTP errors by the global exception filter. The checked-in
proto files under `src/proto/` are copies of the contracts used by the five
service repositories; keep them synchronized when those contracts change.
Swagger documents bearer authentication; use the login response's
`accessToken` in the Swagger **Authorize** dialog.

Validation errors return HTTP 400 with `statusCode` and field-specific
`message` entries. Other errors use the same response shape. Internal and
downstream error details are not returned to clients.

## Tests

Tests run with Jest:

```bash
npm test
npm run test:e2e
```

Jest unit tests cover controller-to-service and service-to-RPC request
mapping. The global validation pipe transforms DTOs, whitelists their fields,
and rejects unknown request properties.

## Structure

- `src/main.ts` configures the global prefix, validation, CORS, Swagger, HTTP
  listener, and exception filter.
- `src/app.module.ts` loads environment configuration and composes the gateway
  modules.
- `src/grpc/grpc-clients.module.ts` configures the five gRPC clients.
- `src/proto/` contains the service contracts used by those clients.
- `src/customers/`, `src/banking/`, `src/search/`, `src/statements/`, and
  `src/settlements/` contain the REST controllers, DTOs, and RPC mapping
  services.
- `src/common/grpc-exception.filter.ts` maps downstream gRPC failures to HTTP
  responses.
- `src/health/` contains the existing health endpoint and its test.
- `test/app.e2e-spec.ts` covers the health response and API docs.
- `.env` documents the gateway's environment variables.
