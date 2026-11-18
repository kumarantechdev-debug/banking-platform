jest.mock('@nestjs/common', () => ({
  Inject: () => () => undefined,
  Injectable: () => (target: Function) => target,
  Logger: class {
    error(): void {}
    log(): void {}
  },
}));

jest.mock('@nestjs/microservices', () => ({
  RpcException: class extends Error {
    constructor(error: { message: string }) {
      super(error.message);
    }
  },
}));

import Redis from 'ioredis';
import { SearchService } from './search.service';
import {
  CUSTOMER_CITY_INDEX,
  CUSTOMER_HASH_PREFIX,
  CUSTOMER_MOBILE_INDEX,
  CUSTOMER_NAME_INDEX,
  CUSTOMER_STATE_INDEX,
} from './search.constants';

const redisUrl = process.env.SEARCH_TEST_REDIS_URL;
const describeWithRedis = redisUrl ? describe : describe.skip;

describeWithRedis('SearchService (Redis integration)', () => {
  let redis: Redis;
  let service: SearchService;
  const indexKeys = [
    CUSTOMER_NAME_INDEX,
    CUSTOMER_MOBILE_INDEX,
    CUSTOMER_CITY_INDEX,
    CUSTOMER_STATE_INDEX,
  ];
  const customerIds = ['customer-integration-001', 'customer-integration-002'];

  beforeAll(async () => {
    if (!redisUrl) {
      throw new Error(
        'SEARCH_TEST_REDIS_URL must be set for Redis integration tests',
      );
    }
    const databaseNumber = Number(new URL(redisUrl).pathname.slice(1));
    if (!Number.isInteger(databaseNumber) || databaseNumber < 1) {
      throw new Error(
        'SEARCH_TEST_REDIS_URL must select a dedicated nonzero Redis database',
      );
    }
    redis = new Redis(redisUrl);
    await redis.ping();
    service = new SearchService(redis);
    await redis.del(
      ...indexKeys,
      ...customerIds.map((id) => `${CUSTOMER_HASH_PREFIX}${id}`),
    );

    const customers = [
      {
        id: customerIds[0],
        name: 'Sana Lee',
        city: 'San Jose',
        state: 'California',
        mobile: '6000000001',
        status: 'ACTIVE',
      },
      {
        id: customerIds[1],
        name: 'Sanam Rao',
        city: 'Chennai',
        state: 'Maharashtra',
        mobile: '6000000002',
        status: 'ACTIVE',
      },
    ];

    for (const customer of customers) {
      await redis.hset(`${CUSTOMER_HASH_PREFIX}${customer.id}`, customer);
      await redis.zadd(
        CUSTOMER_NAME_INDEX,
        0,
        `${customer.name.toLowerCase()}|${customer.id}`,
      );
      await redis.zadd(
        CUSTOMER_CITY_INDEX,
        0,
        `${customer.city.toLowerCase()}|${customer.id}`,
      );
      await redis.zadd(
        CUSTOMER_STATE_INDEX,
        0,
        `${customer.state.toLowerCase()}|${customer.id}`,
      );
      await redis.zadd(
        CUSTOMER_MOBILE_INDEX,
        0,
        `${customer.mobile}|${customer.id}`,
      );
    }
  });

  afterAll(async () => {
    if (redis) {
      await redis.del(
        ...indexKeys,
        ...customerIds.map((id) => `${CUSTOMER_HASH_PREFIX}${id}`),
      );
      await redis.quit();
    }
  });

  it('runs Redis prefix search across customer name, city, and state indexes', async () => {
    await expect(service.searchCustomers({ q: 'san' })).resolves.toMatchObject({
      total: 2,
      customers: expect.arrayContaining([
        expect.objectContaining({ id: customerIds[0], name: 'Sana Lee' }),
        expect.objectContaining({ id: customerIds[1], name: 'Sanam Rao' }),
      ]),
    });

    await expect(service.searchCustomers({ q: 'chen' })).resolves.toMatchObject(
      {
        total: 1,
        customers: [
          expect.objectContaining({ id: customerIds[1], city: 'Chennai' }),
        ],
      },
    );
    await expect(service.searchCustomers({ q: 'maha' })).resolves.toMatchObject(
      {
        total: 1,
        customers: [
          expect.objectContaining({ id: customerIds[1], state: 'Maharashtra' }),
        ],
      },
    );
    await expect(service.searchCustomers({ q: 'missing' })).resolves.toEqual({
      customers: [],
      total: 0,
    });
  });
});
