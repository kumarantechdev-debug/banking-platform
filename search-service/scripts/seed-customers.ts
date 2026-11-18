import Redis from 'ioredis';
import { loadLocalEnvironment } from '../src/redis/load-env';
import {
  CUSTOMER_CITY_INDEX,
  CUSTOMER_HASH_PREFIX,
  CUSTOMER_INDEX_KEYS,
  CUSTOMER_MOBILE_INDEX,
  CUSTOMER_NAME_INDEX,
  CUSTOMER_SEED_IDS_KEY,
  CUSTOMER_STATE_INDEX,
  normalizeSearchValue,
} from '../src/search/search.constants';
import { createCustomerRecord } from '../src/search/customer-data';

const CUSTOMER_COUNT = 50_000;
const BATCH_SIZE = 500;

function createRedisClient(): Redis {
  const port = Number(process.env.REDIS_PORT ?? 6379);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('REDIS_PORT must be a valid TCP port');
  }

  const redis = new Redis({
    host: process.env.REDIS_HOST ?? 'localhost',
    port,
    maxRetriesPerRequest: 2,
    retryStrategy: (attempt) => (attempt <= 5 ? attempt * 200 : null),
  });
  redis.on('error', (error: Error) =>
    console.error(`Redis seed connection error: ${error.message}`),
  );
  return redis;
}

async function clearPreviousSeed(redis: Redis): Promise<void> {
  const previousIds = await redis.smembers(CUSTOMER_SEED_IDS_KEY);
  for (let offset = 0; offset < previousIds.length; offset += BATCH_SIZE) {
    const pipeline = redis.pipeline();
    for (const id of previousIds.slice(offset, offset + BATCH_SIZE)) {
      pipeline.del(`${CUSTOMER_HASH_PREFIX}${id}`);
    }
    await executePipeline(pipeline);
  }
  await redis.del(...CUSTOMER_INDEX_KEYS, CUSTOMER_SEED_IDS_KEY);
}

async function executePipeline(
  pipeline: ReturnType<Redis['pipeline']>,
): Promise<void> {
  const results = await pipeline.exec();
  if (results === null) {
    throw new Error('Redis returned no pipeline result');
  }
  const failure = results.find(([error]) => error !== null);
  if (failure?.[0]) {
    throw failure[0];
  }
}

export async function seedCustomers(redis: Redis): Promise<number> {
  await redis.ping();
  await clearPreviousSeed(redis);

  let inserted = 0;
  for (let offset = 0; offset < CUSTOMER_COUNT; offset += BATCH_SIZE) {
    const pipeline = redis.pipeline();
    const ids: string[] = [];

    for (
      let index = offset;
      index < Math.min(offset + BATCH_SIZE, CUSTOMER_COUNT);
      index += 1
    ) {
      const customer = createCustomerRecord(index);
      const hashKey = `${CUSTOMER_HASH_PREFIX}${customer.id}`;
      const normalizedName = normalizeSearchValue(customer.name);
      const normalizedCity = normalizeSearchValue(customer.city);
      const normalizedState = normalizeSearchValue(customer.state);
      ids.push(customer.id);

      pipeline.hset(hashKey, customer);
      pipeline.zadd(CUSTOMER_NAME_INDEX, 0, `${normalizedName}|${customer.id}`);
      pipeline.zadd(
        CUSTOMER_MOBILE_INDEX,
        0,
        `${normalizeSearchValue(customer.mobile)}|${customer.id}`,
      );
      pipeline.zadd(CUSTOMER_CITY_INDEX, 0, `${normalizedCity}|${customer.id}`);
      pipeline.zadd(
        CUSTOMER_STATE_INDEX,
        0,
        `${normalizedState}|${customer.id}`,
      );
    }

    pipeline.sadd(CUSTOMER_SEED_IDS_KEY, ...ids);
    await executePipeline(pipeline);
    inserted += ids.length;
  }
  return inserted;
}

async function main(): Promise<void> {
  loadLocalEnvironment();
  const redis = createRedisClient();
  try {
    const inserted = await seedCustomers(redis);
    if (inserted !== CUSTOMER_COUNT) {
      throw new Error(
        `Expected ${CUSTOMER_COUNT} records, inserted ${inserted}`,
      );
    }
    console.log(`Successfully inserted ${inserted} customer records.`);
  } finally {
    if (redis.status === 'ready') {
      await redis.quit();
    } else {
      redis.disconnect();
    }
  }
}

if (require.main === module) {
  void main().catch((error: unknown) => {
    console.error(
      'Customer seed failed:',
      error instanceof Error ? error.message : String(error),
    );
    process.exitCode = 1;
  });
}
