import { Inject, Injectable, Logger } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { status } from '@grpc/grpc-js';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../redis/redis.constants';
import {
  CUSTOMER_INDEX_KEYS,
  CUSTOMER_HASH_PREFIX,
  DEFAULT_SEARCH_LIMIT,
  MAX_SEARCH_LIMIT,
  normalizeSearchValue,
  SEARCH_CUSTOMERS_SCRIPT,
} from './search.constants';
import type {
  CustomerRecord,
  SearchCustomersRequest,
  SearchCustomersResponse,
} from './search.types';

const CUSTOMER_FIELDS = ['name', 'city', 'state', 'mobile', 'status'] as const;

@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name);

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async searchCustomers(
    request: SearchCustomersRequest,
  ): Promise<SearchCustomersResponse> {
    const startedAt = performance.now();
    let total = 0;
    try {
      if (typeof request?.q !== 'string') {
        throw new RpcException({
          code: status.INVALID_ARGUMENT,
          message: 'Search query is required',
        });
      }

      const query = normalizeSearchValue(request.q);
      if (!query || query.length > 100) {
        throw new RpcException({
          code: status.INVALID_ARGUMENT,
          message: 'Search query must contain between 1 and 100 characters',
        });
      }

      if (
        request.limit !== undefined &&
        (!Number.isInteger(request.limit) || request.limit < 1)
      ) {
        throw new RpcException({
          code: status.INVALID_ARGUMENT,
          message: 'Limit must be a positive integer',
        });
      }

      const limit = Math.min(
        request.limit ?? DEFAULT_SEARCH_LIMIT,
        MAX_SEARCH_LIMIT,
      );
      const result = (await this.redis.eval(
        SEARCH_CUSTOMERS_SCRIPT,
        CUSTOMER_INDEX_KEYS.length,
        ...CUSTOMER_INDEX_KEYS,
        query,
        String(limit),
        CUSTOMER_HASH_PREFIX,
      )) as Array<number | string>;

      total = Number(result[0]);
      const ids = result.slice(1).map(String);
      if (ids.length === 0) {
        return { customers: [], total };
      }

      const pipeline = this.redis.pipeline();
      for (const id of ids) {
        pipeline.hmget(`${CUSTOMER_HASH_PREFIX}${id}`, ...CUSTOMER_FIELDS);
      }
      const rows = await pipeline.exec();
      if (rows === null) {
        throw new Error('Redis returned no pipeline result');
      }

      const customers: CustomerRecord[] = [];
      for (let index = 0; index < rows.length; index += 1) {
        const [error, rawValues] = rows[index];
        if (error) {
          throw error;
        }
        const values = Array.isArray(rawValues)
          ? (rawValues as Array<string | null>)
          : null;
        if (!values || values.every((value) => value === null)) {
          continue;
        }

        customers.push({
          id: ids[index],
          name: values[0] ?? '',
          city: values[1] ?? '',
          state: values[2] ?? '',
          mobile: values[3] ?? '',
          status: values[4] ?? '',
        });
      }

      return { customers, total };
    } catch (error) {
      if (error instanceof RpcException) {
        throw error;
      }
      this.logger.error('Customer search failed', error);
      throw new RpcException({
        code: status.INTERNAL,
        message: 'Customer search is temporarily unavailable',
      });
    } finally {
      this.logger.log(
        `SearchCustomers took ${(performance.now() - startedAt).toFixed(2)}ms (${total} matches)`,
      );
    }
  }
}
