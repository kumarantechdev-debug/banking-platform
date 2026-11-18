jest.mock('@nestjs/microservices', () => {
  class MockRpcException extends Error {
    constructor(private readonly error: unknown) {
      super(
        typeof error === 'object' &&
          error !== null &&
          'message' in error &&
          typeof error.message === 'string'
          ? error.message
          : String(error),
      );
    }

    getError(): unknown {
      return this.error;
    }
  }

  return { RpcException: MockRpcException };
});

jest.mock('@nestjs/common', () => ({
  Inject: () => () => undefined,
  Injectable: () => (target: Function) => target,
  Logger: class {
    error(): void {}
    log(): void {}
  },
}));

import { status } from '@grpc/grpc-js';
import { RpcException } from '@nestjs/microservices';
import type Redis from 'ioredis';
import {
  CUSTOMER_INDEX_KEYS,
} from './search.constants';
import { SearchService } from './search.service';
import type { CustomerRecord } from './search.types';

const sampleCustomer: CustomerRecord = {
  id: 'customer-00001',
  name: 'Aarav Sharma',
  city: 'Chennai',
  state: 'Tamil Nadu',
  mobile: '6000000000',
  status: 'ACTIVE',
};

describe('SearchService', () => {
  let service: SearchService;
  let matchedIds: string[];
  let selectedIds: string[];
  let totalMatches: number;
  let records: Map<string, CustomerRecord>;
  let evalMock: jest.Mock;
  let pipelineExec: jest.Mock;

  beforeEach(() => {
    matchedIds = [sampleCustomer.id];
    selectedIds = [sampleCustomer.id];
    totalMatches = 1;
    records = new Map([[sampleCustomer.id, sampleCustomer]]);
    pipelineExec = jest.fn(async () =>
      selectedIds.map((id) => {
        const customer = records.get(id);
        return [
          null,
          customer
            ? [
                customer.name,
                customer.city,
                customer.state,
                customer.mobile,
                customer.status,
              ]
            : [null, null, null, null, null],
        ];
      }),
    );

    const redisMock = {
      eval: jest.fn(async (...args: unknown[]) => {
        const requestedLimit = Number(args[7]);
        selectedIds = matchedIds.slice(0, requestedLimit);
        return [totalMatches, ...selectedIds];
      }),
      pipeline: jest.fn(() => ({
        hmget: jest.fn().mockReturnThis(),
        exec: pipelineExec,
      })),
    };
    evalMock = redisMock.eval;
    service = new SearchService(redisMock as unknown as Redis);
  });

  it('searches customer name prefixes', async () => {
    const response = await service.searchCustomers({ q: 'aar' });

    expect(response.customers[0].name).toBe('Aarav Sharma');
    expect(evalMock.mock.calls[0].slice(2, 6)).toEqual(CUSTOMER_INDEX_KEYS);
  });

  it('searches city prefixes', async () => {
    const response = await service.searchCustomers({ q: 'chen' });

    expect(response.customers[0].city).toBe('Chennai');
  });

  it('searches state prefixes', async () => {
    const response = await service.searchCustomers({ q: 'tamil' });

    expect(response.customers[0].state).toBe('Tamil Nadu');
  });

  it('normalizes query case and surrounding whitespace', async () => {
    await service.searchCustomers({ q: '  CHEN  ' });

    expect(evalMock.mock.calls[0][6]).toBe('chen');
  });

  it('uses prefix matching for predictive search', async () => {
    const response = await service.searchCustomers({ q: 'che' });

    expect(response.customers.map(({ city }) => city)).toEqual(['Chennai']);
  });

  it('searches customer mobile number prefixes', async () => {
    const response = await service.searchCustomers({ q: '600' });

    expect(response.customers[0].mobile).toBe('6000000000');
    expect(evalMock.mock.calls[0].slice(2, 6)).toEqual(CUSTOMER_INDEX_KEYS);
  });

  it('rejects empty search queries', async () => {
    await expectRpcStatus(service.searchCustomers({ q: '  ' }), status.INVALID_ARGUMENT);
  });

  it('returns an empty result when there are no matches', async () => {
    matchedIds = [];
    totalMatches = 0;

    await expect(service.searchCustomers({ q: 'no-match' })).resolves.toEqual({
      customers: [],
      total: 0,
    });
  });

  it('does not return a customer more than once for multiple matching fields', async () => {
    matchedIds = [sampleCustomer.id];
    totalMatches = 1;

    const response = await service.searchCustomers({ q: 'chen' });

    expect(response.customers).toHaveLength(1);
    expect(response.total).toBe(1);
  });

  it('defaults to ten returned customers while preserving the total', async () => {
    setCustomers(12);
    totalMatches = 12;

    const response = await service.searchCustomers({ q: 'a' });

    expect(response.customers).toHaveLength(10);
    expect(response.total).toBe(12);
    expect(evalMock.mock.calls[0][7]).toBe('10');
  });

  it('caps the result limit at fifty', async () => {
    setCustomers(60);
    totalMatches = 60;

    const response = await service.searchCustomers({ q: 'a', limit: 500 });

    expect(response.customers).toHaveLength(50);
    expect(response.total).toBe(60);
    expect(evalMock.mock.calls[0][7]).toBe('50');
  });

  it('converts Redis query failures to a gRPC internal error', async () => {
    evalMock.mockRejectedValueOnce(new Error('Redis unavailable'));

    await expectRpcStatus(service.searchCustomers({ q: 'aar' }), status.INTERNAL);
  });

  it('converts Redis customer-fetch failures to a gRPC internal error', async () => {
    pipelineExec.mockRejectedValueOnce(new Error('Redis unavailable'));

    await expectRpcStatus(service.searchCustomers({ q: 'aar' }), status.INTERNAL);
  });

  it('returns the expected customer response structure', async () => {
    const response = await service.searchCustomers({ q: 'aar' });

    expect(response).toEqual({
      customers: [sampleCustomer],
      total: 1,
    });
  });

  it('rejects non-positive result limits', async () => {
    await expectRpcStatus(
      service.searchCustomers({ q: 'aar', limit: 0 }),
      status.INVALID_ARGUMENT,
    );
  });

  function setCustomers(count: number): void {
    matchedIds = Array.from(
      { length: count },
      (_, index) => `customer-${String(index + 1).padStart(5, '0')}`,
    );
    records = new Map(
      matchedIds.map((id, index) => [
        id,
        { ...sampleCustomer, id, name: `Customer ${index}` },
      ]),
    );
  }
});

async function expectRpcStatus(
  promise: Promise<unknown>,
  code: number,
): Promise<void> {
  await expect(promise).rejects.toBeInstanceOf(RpcException);
  await promise.catch((error: RpcException) => {
    expect(error.getError()).toMatchObject({ code });
  });
}
