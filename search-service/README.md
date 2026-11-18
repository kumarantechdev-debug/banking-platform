# Search Service

NestJS gRPC customer prefix search backed by Redis and ioredis.

## Requirements and configuration

Use Node.js 22.22.3+ (or 24.15+) and a Redis server. Configure `.env` with
`REDIS_HOST`, `REDIS_PORT`, `GRPC_HOST`, and `GRPC_PORT` as needed. Defaults are
`localhost:6379` and `0.0.0.0:50053`. `.env` is ignored by git.

```bash
npm install
npm run build
npm run start:dev
```

The service exposes no HTTP endpoints. Its Protocol Buffers definition is
[`proto/search.proto`](./proto/search.proto); the build copies it to `dist/proto`
for production startup.

## Search RPC

`search.SearchService/SearchCustomers` accepts:

```json
{ "q": "che", "limit": 10 }
```

and returns `{ customers: [...], total: number }`. Search is case-insensitive,
prefix-based across customer name, mobile number, city, and state. Queries are trimmed; blank
or longer-than-100-character queries and non-positive limits return
`INVALID_ARGUMENT`. The default limit is 10 and larger positive limits are
capped at 50. Redis failures return `INTERNAL` without exposing backend details.

Each customer hash is stored at `search:customer:<id>`. The name, mobile, city, and
state sorted-set indexes are `search:index:customer:name`,
`search:index:customer:mobile`, `search:index:customer:city`, and
`search:index:customer:state`. Their members
are normalized `value|id` strings with score zero, enabling lexicographical
prefix ranges. A Redis Lua query unions and deduplicates matching IDs and checks
that each hash exists; the service loads only the limited customer hashes in a
pipeline. The exact unique match count is computed within Redis. Every search
logs its execution time.

## Seed and benchmark

Start Redis, then seed exactly 50,000 deterministic sample customers:

```bash
npm run seed:customers
```

The seed script only clears its own registered customer hashes and the four
Search Service indexes; it does not use `KEYS` or delete unrelated data.

Start the gRPC service in a separate terminal, then run 100 benchmark calls
against it:

```bash
npm run start:dev
npm run benchmark:search
```

The benchmark reports measured average and maximum end-to-end gRPC latency. Its
results depend on the host and Redis environment; no latency target is
guaranteed without running it there.

## Postman

1. Select **gRPC** in Postman and connect to `localhost:50053`.
2. Import `proto/search.proto` as the service definition.
3. Select `search.SearchService` → `SearchCustomers`.
4. Send `{"q":"chen","limit":10}`. Try `aar` for a name prefix and `maha` for a
   state prefix. A successful response contains `customers` and `total`.

## Tests

```bash
npm test
```

Search unit tests mock Redis and do not require a live Redis server.

## Observability

NestJS Observe remains configured. To connect it, use `npx @nestjs/observe link`
or provide `OBSERVE_APP_KEY` and `OBSERVE_APP_SECRET` through the environment.
