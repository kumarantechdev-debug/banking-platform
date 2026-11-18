import { jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { of } from 'rxjs';
import { SEARCH_GRPC_CLIENT } from '../grpc/grpc-clients.module.js';
import { SearchCustomersDto } from './search.dto.js';
import { SearchController } from './search.controller.js';
import { SearchService } from './search.service.js';

describe('SearchController', () => {
  let controller: SearchController;
  const service = { searchCustomers: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SearchController],
      providers: [{ provide: SearchService, useValue: service }],
    }).compile();
    controller = module.get(SearchController);
  });

  it('passes query filters to the search service', async () => {
    const query: SearchCustomersDto = { q: 'Asha', limit: 5 };
    service.searchCustomers.mockResolvedValue({ customers: [], total: 0 });

    await expect(controller.searchCustomers(query)).resolves.toEqual({
      customers: [],
      total: 0,
    });
    expect(service.searchCustomers).toHaveBeenCalledWith(query);
  });
});

describe('SearchService', () => {
  it('calls the SearchCustomers RPC with its actual query fields', async () => {
    const response = { customers: [], total: 0 };
    const rpc = { searchCustomers: jest.fn().mockReturnValue(of(response)) };
    const module = await Test.createTestingModule({
      providers: [
        SearchService,
        {
          provide: SEARCH_GRPC_CLIENT,
          useValue: { getService: jest.fn().mockReturnValue(rpc) },
        },
      ],
    }).compile();
    const service = module.get(SearchService);
    service.onModuleInit();

    await expect(service.searchCustomers({ q: 'Asha', limit: 5 })).resolves.toEqual(
      response,
    );
    expect(rpc.searchCustomers).toHaveBeenCalledWith({ q: 'Asha', limit: 5 });
  });
});
