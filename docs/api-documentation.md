# Banking Platform API Documentation

This document describes the REST endpoints implemented by
`banking-api-gateway`. The Gateway prefixes routes with `/api`; examples below
use the default local address `http://localhost:3000`. Example values are
illustrative; response fields and request fields follow the Gateway
implementation.

## Swagger UI

Start the API Gateway and open
[http://localhost:3000/api/docs](http://localhost:3000/api/docs). The port
comes from `PORT` and defaults to `3000`. Swagger UI is generated from the
Gateway controllers and DTO metadata.

The API uses the `access_token` cookie security scheme. To call protected
operations, first log in through `/api/auth/login` in the same browser session
so the browser stores the cookie. Cross-origin browser clients must send
credentials and use an origin allowed by the Gateway's `CORS_ORIGIN`
configuration.

## Authentication

The Gateway applies a JWT guard globally. The health check, login, and customer
creation endpoints are public; all other endpoints below require a valid
`access_token` cookie. The cookie contains a JWT signed with `JWT_SECRET` and
expires according to `JWT_EXPIRES_IN` (default `15m`). The token includes the
customer ID and mobile in its claims. The cookie is `HttpOnly`, has
`SameSite=Lax` and `Path=/`, and is `Secure` when `NODE_ENV=production`.

The login response body does not contain the token; the token is set in the
cookie. Logout requires authentication and clears that cookie. The Gateway
does not extract JWTs from an `Authorization: Bearer` header.

## Common error responses

Gateway validation and exception handling return a JSON body with
`statusCode` and `message`. Validation messages may be an array; mapped
downstream errors normally have a string message. Examples:

```json
{
  "statusCode": 400,
  "message": ["name must be shorter than or equal to 150 characters"]
}
```

```json
{
  "statusCode": 404,
  "message": "Resource not found"
}
```

The Gateway's gRPC exception filter maps downstream errors as follows:

| HTTP status | Downstream gRPC condition |
| --- | --- |
| `400` | Invalid argument or out-of-range value |
| `401` | Unauthenticated |
| `403` | Permission denied |
| `404` | Resource not found |
| `409` | Already exists or failed precondition |
| `429` | Resource exhausted |
| `502` | Other/unmapped downstream service error |
| `503` | Downstream request cancelled or service unavailable |
| `504` | Downstream deadline exceeded |
| `500` | Unhandled Gateway/internal error |

Protected endpoints can also return `401` when the cookie is missing, invalid,
or expired. Each endpoint section lists its relevant validation or
not-found responses; backend-backed endpoints may return the mapped status
appropriate to a downstream failure.

## Health API

### Check Gateway health

**`GET /api/health`** — Return the Gateway's health status.
**Authentication:** Public.

No path parameters, query parameters, or request body.

Successful response (`200 OK`):

```json
{
  "status": "success",
  "service": "banking-api-gateway"
}
```

No endpoint-specific error response is declared. An unhandled internal
Gateway error uses the common `500` response.

## Authentication APIs

### Log in

**`POST /api/auth/login`** — Verify a customer's mobile and password and set
the JWT cookie. **Authentication:** Public.

Request body:

```json
{
  "mobile": "+14155552671",
  "password": "<customer-password>"
}
```

`mobile` must match the configured mobile-number pattern and be at most 15
characters. `password` is required and at most 72 characters.

Successful response (`200 OK`):

```json
{
  "message": "Login successful"
}
```

The response also sets the `access_token` cookie. Possible errors: `400`
invalid request; `401` invalid credentials. Other downstream failures use the
common mappings above.

### Log out

**`POST /api/auth/logout`** — Clear the authenticated JWT cookie.
**Authentication:** Required.

Successful response (`200 OK`):

```json
{
  "message": "Logout successful"
}
```

Possible errors: `401` missing, invalid, or expired cookie.

## Customer APIs

### Create a customer

**`POST /api/customers`** — Create a customer.
**Authentication:** Public.

Request body:

```json
{
  "name": "Alex Morgan",
  "mobile": "+14155552671",
  "city": "Austin",
  "state": "Texas",
  "password": "<customer-password>"
}
```

The password is write-only input and is not included in the response.

Successful response (`201 Created`):

```json
{
  "id": 101,
  "name": "Alex Morgan",
  "mobile": "+14155552671",
  "city": "Austin",
  "state": "Texas",
  "status": "ACTIVE"
}
```

Possible errors: `400` invalid customer details; other downstream failures
use the common mappings.

### List customers

**`GET /api/customers`** — List customers with optional filters, pagination,
and sorting. **Authentication:** Required.

Query parameters:

| Parameter | Type | Constraints / default |
| --- | --- | --- |
| `page` | integer | Minimum `1`; default `1`. |
| `limit` | integer | `1`–`100`; default `10`. |
| `name` | string | Maximum 150 characters. |
| `mobile` | string | Maximum 15 characters. |
| `city` | string | Maximum 100 characters. |
| `state` | string | Maximum 100 characters. |
| `status` | string | `ACTIVE` or `INACTIVE`. |
| `fromDate` | string | ISO date or date-time accepted by validation. |
| `toDate` | string | ISO date or date-time accepted by validation. |
| `sortBy` | string | `createdAt`, `name`, `mobile`, or `city`. |
| `sortOrder` | string | `ASC` or `DESC`; default `DESC`. |

Example: `GET /api/customers?page=1&limit=10&city=Austin&status=ACTIVE&sortBy=name&sortOrder=ASC`

The default sort column is `createdAt`. `name`, `mobile`, `city`, and `state`
filters use prefix matching; `status` is an exact match. Date bounds filter
customer creation time. A date-only `toDate` includes that whole UTC calendar
day.

Successful response (`200 OK`):

```json
{
  "customers": [
    {
      "id": 101,
      "name": "Alex Morgan",
      "mobile": "+14155552671",
      "city": "Austin",
      "state": "Texas",
      "status": "ACTIVE"
    }
  ],
  "total": 1,
  "page": 1,
  "limit": 10
}
```

Possible errors: `400` invalid filters; `401` missing or invalid cookie; other
downstream failures use the common mappings.

### Get a customer

**`GET /api/customers/:id`** — Retrieve a customer by ID.
**Authentication:** Required.

Path parameter: `id` must be a positive 32-bit integer.

Successful response (`200 OK`):

```json
{
  "id": 101,
  "name": "Alex Morgan",
  "mobile": "+14155552671",
  "city": "Austin",
  "state": "Texas",
  "status": "ACTIVE"
}
```

Possible errors: `400` invalid ID; `401` missing or invalid cookie; `404`
customer not found; other downstream failures use the common mappings.

## Account APIs

### Create an account

**`POST /api/accounts`** — Create an account for a customer.
**Authentication:** Required.

Request body:

```json
{
  "customerId": 101,
  "initialBalance": "100.00"
}
```

`customerId` must be a positive 32-bit integer. `initialBalance` accepts zero
or a positive amount with up to 13 integer digits and up to two decimal
places, without leading zeroes except for zero itself; numeric JSON input is
transformed to a string.

Successful response (`201 Created`):

```json
{
  "id": 501,
  "accountNumber": "BA000000123456789",
  "customerId": 101,
  "balance": "100.00",
  "status": "ACTIVE",
  "createdAt": "2026-01-31T12:00:00.000Z"
}
```

Possible errors: `400` invalid account details; `401` missing or invalid
cookie; downstream customer/account errors use the common mappings.

### Get an account

**`GET /api/accounts/:id`** — Retrieve an account by ID.
**Authentication:** Required.

Path parameter: `id` must be a positive 32-bit integer.

Successful response (`200 OK`):

```json
{
  "id": 501,
  "accountNumber": "BA000000123456789",
  "customerId": 101,
  "balance": "100.00",
  "status": "ACTIVE",
  "createdAt": "2026-01-31T12:00:00.000Z"
}
```

Possible errors: `400` invalid ID; `401` missing or invalid cookie; `404`
account not found; other downstream failures use the common mappings.

## Transfer APIs

### Create a transfer

**`POST /api/transfers`** — Transfer funds between accounts.
**Authentication:** Required.

Request body:

```json
{
  "fromAccountId": 501,
  "toAccountId": 502,
  "amount": "25.00",
  "idempotencyKey": "transfer-2026-0001"
}
```

Account IDs must be positive 32-bit integers. `amount` must be a positive
amount with up to 13 integer digits and up to two decimal places, without
leading zeroes. `idempotencyKey` must be 8–100 alphanumeric or `.`, `_`, `:`,
`-` characters.

Successful response (`201 Created`):

```json
{
  "id": 9001,
  "fromAccountId": 501,
  "toAccountId": 502,
  "amount": "25.00",
  "status": "SUCCESS",
  "referenceNumber": "TR-550e8400-e29b-41d4-a716-446655440000",
  "createdAt": "2026-01-31T12:05:00.000Z"
}
```

Possible errors: `400` invalid transfer details; `401` missing or invalid
cookie; account, idempotency, and other downstream errors use the common
mappings.

### Get a transfer

**`GET /api/transfers/:id`** — Retrieve a transfer by ID.
**Authentication:** Required.

Path parameter: `id` must be a positive 32-bit integer.

Successful response (`200 OK`):

```json
{
  "id": 9001,
  "fromAccountId": 501,
  "toAccountId": 502,
  "amount": "25.00",
  "status": "SUCCESS",
  "referenceNumber": "TR-550e8400-e29b-41d4-a716-446655440000",
  "createdAt": "2026-01-31T12:05:00.000Z"
}
```

Possible errors: `400` invalid ID; `401` missing or invalid cookie; `404`
transfer not found; other downstream failures use the common mappings.

## Search APIs

### Search customers

**`GET /api/search/customers`** — Prefix-search customers by name, mobile,
city, or state. **Authentication:** Required.

Query parameters:

| Parameter | Type | Constraints / default |
| --- | --- | --- |
| `q` | string | Required; 1–100 characters and must contain a non-whitespace character. |
| `limit` | integer | Optional; `1`–`100` accepted by the Gateway. The Search Service defaults to 10 and caps the effective result limit at 50. |

Example: `GET /api/search/customers?q=alex&limit=10`

Successful response (`200 OK`):

```json
{
  "customers": [
    {
      "id": "customer-00001",
      "name": "Aarav Sharma",
      "city": "Mumbai",
      "state": "Maharashtra",
      "mobile": "6000000000",
      "status": "ACTIVE"
    }
  ],
  "total": 1
}
```

Search is case-insensitive and uses prefix matches across the listed fields.
Possible errors: `400` invalid query or limit; `401` missing or invalid
cookie; other downstream failures use the common mappings.

## Statement APIs

### Generate a statement

**`POST /api/statements`** — Generate an account statement for a date range.
**Authentication:** Required.

Request body:

```json
{
  "accountId": 501,
  "fromDate": "2026-01-01",
  "toDate": "2026-01-31"
}
```

Dates must be valid `YYYY-MM-DD` dates; `accountId` must be a positive
32-bit integer.

Successful response (`201 Created`):

```json
{
  "statement": {
    "id": 3001,
    "accountId": 501,
    "fromDate": "2026-01-01",
    "toDate": "2026-01-31",
    "openingBalance": "100.00",
    "closingBalance": "125.00",
    "generatedAt": "2026-01-31T12:10:00.000Z",
    "status": "GENERATED",
    "transactions": [
      {
        "id": 1,
        "statementId": 3001,
        "transferId": 9001,
        "transactionDate": "2026-01-15T10:00:00.000Z",
        "transactionType": "CREDIT",
        "amount": "25.00",
        "description": "Transfer",
        "balanceAfter": "125.00",
        "isAccountOpening": false
      }
    ]
  },
  "success": true,
  "message": "Statement generated successfully."
}
```

Possible errors: `400` invalid date range or account ID; `401` missing or
invalid cookie; other downstream failures use the common mappings.

### Get a statement

**`GET /api/statements/:id`** — Retrieve a statement and its transactions.
**Authentication:** Required.

Path parameter: `id` must be a positive 32-bit integer.

Optional query parameters:

| Parameter | Type | Constraints |
| --- | --- | --- |
| `transactionType` | string | `CREDIT` or `DEBIT` (case-insensitive input is uppercased). |
| `fromDate` | string | Valid `YYYY-MM-DD` date. |
| `toDate` | string | Valid `YYYY-MM-DD` date. |
| `page` | integer | Minimum `1`; default `1` when query options are supplied. |
| `limit` | integer | `1`–`100`; default `10` when query options are supplied. |

When any of these query options is supplied, the Gateway requests paginated
mode. With no query options, it requests non-paginated mode.

Example: `GET /api/statements/3001?transactionType=CREDIT&page=1&limit=10`

Successful response (`200 OK`):

```json
{
  "id": 3001,
  "accountId": 501,
  "fromDate": "2026-01-01",
  "toDate": "2026-01-31",
  "openingBalance": "100.00",
  "closingBalance": "125.00",
  "generatedAt": "2026-01-31T12:10:00.000Z",
  "status": "GENERATED",
  "transactions": [
    {
      "id": 1,
      "statementId": 3001,
      "transferId": 9001,
      "transactionDate": "2026-01-15T10:00:00.000Z",
      "transactionType": "CREDIT",
      "amount": "25.00",
      "description": "Transfer",
      "balanceAfter": "125.00",
      "isAccountOpening": false
    }
  ],
  "total": 1,
  "page": 1,
  "limit": 10,
  "totalPages": 1
}
```

Possible errors: `400` invalid ID or query; `401` missing or invalid cookie;
`404` statement not found; other downstream failures use the common mappings.

### Export a statement as CSV

**`GET /api/statements/:id/export/csv`** — Download the statement as a CSV
file. **Authentication:** Required.

Path parameter: `id` must be a positive 32-bit integer. No request body or
query parameters.

Successful response (`200 OK`): file download with `Content-Type: text/csv`
and an attachment filename supplied by the service.

Possible errors: `400` invalid ID; `401` missing or invalid cookie; `404`
statement not found; other downstream failures use the common mappings.

### Export a statement as PDF

**`GET /api/statements/:id/export/pdf`** — Download the statement as a PDF
file. **Authentication:** Required.

Path parameter: `id` must be a positive 32-bit integer. No request body or
query parameters.

Successful response (`200 OK`): file download with
`Content-Type: application/pdf` and an attachment filename supplied by the
service.

Possible errors: `400` invalid ID; `401` missing or invalid cookie; `404`
statement not found; other downstream failures use the common mappings.

## Settlement APIs

### Create a settlement job

**`POST /api/settlements`** — Create a settlement job for a date.
**Authentication:** Required.

Request body:

```json
{
  "jobDate": "2026-01-31"
}
```

`jobDate` must be a valid `YYYY-MM-DD` date.

Successful response (`201 Created`):

```json
{
  "jobId": 7001,
  "jobDate": "2026-01-31",
  "status": "PENDING",
  "message": "Settlement job created successfully."
}
```

Possible errors: `400` invalid job date; `401` missing or invalid cookie;
duplicate-job and other downstream failures use the common mappings.

### Process a settlement job

**`POST /api/settlements/:id/process`** — Process the specified settlement
job. **Authentication:** Required.

Path parameter: `id` must be a positive 32-bit integer. No request body.

Successful response (`200 OK`):

```json
{
  "job": {
    "id": 7001,
    "jobDate": "2026-01-31",
    "status": "COMPLETED",
    "totalTransactions": 12,
    "successfulTransactions": 12,
    "failedTransactions": 0,
    "startedAt": "2026-02-01T01:00:00.000Z",
    "completedAt": "2026-02-01T01:01:00.000Z",
    "createdAt": "2026-01-31T12:00:00.000Z"
  }
}
```

Possible errors: `400` invalid ID; `401` missing or invalid cookie; `404`
settlement job not found; other downstream failures use the common mappings.

### Get a settlement job

**`GET /api/settlements/:id`** — Retrieve settlement job details.
**Authentication:** Required.

Path parameter: `id` must be a positive 32-bit integer.

Successful response (`200 OK`):

```json
{
  "job": {
    "id": 7001,
    "jobDate": "2026-01-31",
    "status": "COMPLETED",
    "totalTransactions": 12,
    "successfulTransactions": 12,
    "failedTransactions": 0,
    "startedAt": "2026-02-01T01:00:00.000Z",
    "completedAt": "2026-02-01T01:01:00.000Z",
    "createdAt": "2026-01-31T12:00:00.000Z"
  }
}
```

Possible errors: `400` invalid ID; `401` missing or invalid cookie; `404`
settlement job not found; other downstream failures use the common mappings.

### Get a settlement failure report

**`GET /api/settlements/:id/report`** — Retrieve the job and its failed
transactions. **Authentication:** Required.

Path parameter: `id` must be a positive 32-bit integer.

Successful response (`200 OK`):

```json
{
  "job": {
    "id": 7001,
    "jobDate": "2026-01-31",
    "status": "FAILED",
    "totalTransactions": 12,
    "successfulTransactions": 11,
    "failedTransactions": 1,
    "startedAt": "2026-02-01T01:00:00.000Z",
    "completedAt": "2026-02-01T01:02:00.000Z",
    "createdAt": "2026-01-31T12:00:00.000Z"
  },
  "failureTransactions": [
    {
      "id": 12,
      "transferId": 9002,
      "amount": "40.00",
      "status": "FAILED",
      "retryCount": 4,
      "errorMessage": "Settlement attempt failed",
      "nextRetryAt": "",
      "processedAt": "2026-02-01T01:02:00.000Z",
      "createdAt": "2026-02-01T01:00:00.000Z",
      "updatedAt": "2026-02-01T01:02:00.000Z"
    }
  ]
}
```

Possible errors: `400` invalid ID; `401` missing or invalid cookie; `404`
settlement job not found; other downstream failures use the common mappings.
