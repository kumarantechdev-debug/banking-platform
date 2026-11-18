import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import { resolve } from 'node:path';

interface SearchRequest {
  q: string;
  limit: number;
}

interface SearchResponse {
  customers: Array<{
    id: string;
    name: string;
    city: string;
    state: string;
    mobile: string;
    status: string;
  }>;
  total: number;
}

interface SearchClient extends grpc.Client {
  SearchCustomers(
    request: SearchRequest,
    callback: grpc.requestCallback<SearchResponse>,
  ): void;
}

const SAMPLE_QUERIES = ['aar', 'chen', 'maha', 'rohan', 'del'];
const ITERATIONS = 100;

function createClient(): SearchClient {
  const definition = protoLoader.loadSync(
    resolve(process.cwd(), 'proto', 'search.proto'),
    { keepCase: false, defaults: true, oneofs: true },
  );
  const loadedPackage = grpc.loadPackageDefinition(definition);
  const searchPackage = loadedPackage.search as grpc.GrpcObject;
  const service = searchPackage.SearchService as grpc.ServiceClientConstructor;
  const host = process.env.GRPC_HOST ?? '127.0.0.1';
  const port = process.env.GRPC_PORT ?? '50053';
  return new service(
    `${host}:${port}`,
    grpc.credentials.createInsecure(),
  ) as unknown as SearchClient;
}

function search(client: SearchClient, q: string): Promise<SearchResponse> {
  return new Promise((resolvePromise, reject) => {
    client.SearchCustomers({ q, limit: 10 }, (error, response) => {
      if (error) {
        reject(error);
      } else if (response === undefined) {
        reject(new Error('SearchCustomers returned no response'));
      } else {
        resolvePromise(response);
      }
    });
  });
}

async function main(): Promise<void> {
  const client = createClient();
  try {
    for (const query of SAMPLE_QUERIES) {
      await search(client, query);
    }

    const timings: number[] = [];
    for (let iteration = 0; iteration < ITERATIONS; iteration += 1) {
      const query = SAMPLE_QUERIES[iteration % SAMPLE_QUERIES.length];
      const started = process.hrtime.bigint();
      await search(client, query);
      timings.push(Number(process.hrtime.bigint() - started) / 1_000_000);
    }

    const average = timings.reduce((sum, duration) => sum + duration, 0) /
      timings.length;
    const maximum = Math.max(...timings);
    console.log(
      `${timings.length} gRPC searches: average ${average.toFixed(2)}ms, maximum ${maximum.toFixed(2)}ms`,
    );
  } finally {
    client.close();
  }
}

void main().catch((error: unknown) => {
  console.error(
    'Search benchmark failed:',
    error instanceof Error ? error.message : String(error),
  );
  process.exitCode = 1;
});
