import type Redis from 'ioredis';
import { seedCustomers } from './seed-customers';
import {
  CUSTOMER_CITY_INDEX,
  CUSTOMER_HASH_PREFIX,
  CUSTOMER_MOBILE_INDEX,
  CUSTOMER_NAME_INDEX,
  CUSTOMER_SEED_IDS_KEY,
  CUSTOMER_STATE_INDEX,
} from '../src/search/search.constants';

interface PipelineCommand {
  name: string;
  args: unknown[];
}

describe('seedCustomers', () => {
  it('writes 50,000 customer hashes and all four search indexes in batches', async () => {
    const batches: PipelineCommand[][] = [];
    const redis = {
      ping: jest.fn().mockResolvedValue('PONG'),
      smembers: jest.fn().mockResolvedValue([]),
      del: jest.fn().mockResolvedValue(0),
      pipeline: jest.fn(() => {
        const commands: PipelineCommand[] = [];
        batches.push(commands);
        const pipeline = {
          hset: jest.fn((...args: unknown[]) => {
            commands.push({ name: 'hset', args });
            return pipeline;
          }),
          zadd: jest.fn((...args: unknown[]) => {
            commands.push({ name: 'zadd', args });
            return pipeline;
          }),
          sadd: jest.fn((...args: unknown[]) => {
            commands.push({ name: 'sadd', args });
            return pipeline;
          }),
          del: jest.fn((...args: unknown[]) => {
            commands.push({ name: 'del', args });
            return pipeline;
          }),
          exec: jest.fn(async () => commands.map(() => [null, 1])),
        };
        return pipeline;
      }),
    } as unknown as Redis;

    await expect(seedCustomers(redis)).resolves.toBe(50_000);

    const commands = batches.flat();
    const hashes = commands.filter((command) => command.name === 'hset');
    const indexes = commands.filter((command) => command.name === 'zadd');
    const seedSets = commands.filter((command) => command.name === 'sadd');
    const hashKeys = new Set(hashes.map((command) => command.args[0]));
    const indexCounts = new Map<string, number>();
    for (const command of indexes) {
      const key = String(command.args[0]);
      indexCounts.set(key, (indexCounts.get(key) ?? 0) + 1);
    }

    expect(redis.ping).toHaveBeenCalledTimes(1);
    expect(batches).toHaveLength(100);
    expect(hashes).toHaveLength(50_000);
    expect(hashKeys.size).toBe(50_000);
    expect(hashKeys.has(`${CUSTOMER_HASH_PREFIX}customer-00001`)).toBe(true);
    expect(hashKeys.has(`${CUSTOMER_HASH_PREFIX}customer-50000`)).toBe(true);
    expect(indexes).toHaveLength(200_000);
    expect(indexCounts).toEqual(
      new Map([
        [CUSTOMER_NAME_INDEX, 50_000],
        [CUSTOMER_MOBILE_INDEX, 50_000],
        [CUSTOMER_CITY_INDEX, 50_000],
        [CUSTOMER_STATE_INDEX, 50_000],
      ]),
    );
    expect(seedSets).toHaveLength(100);
    expect(
      seedSets.reduce((count, command) => count + command.args.length - 1, 0),
    ).toBe(50_000);
    expect(redis.del).toHaveBeenCalledWith(
      CUSTOMER_NAME_INDEX,
      CUSTOMER_MOBILE_INDEX,
      CUSTOMER_CITY_INDEX,
      CUSTOMER_STATE_INDEX,
      CUSTOMER_SEED_IDS_KEY,
    );
  });
});
