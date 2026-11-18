import { Controller } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { SearchService } from './search.service';
import type {
  SearchCustomersRequest,
  SearchCustomersResponse,
} from './search.types';

@Controller()
export class SearchGrpcController {
  constructor(private readonly searchService: SearchService) {}

  @GrpcMethod('SearchService', 'SearchCustomers')
  searchCustomers(
    request: SearchCustomersRequest,
  ): Promise<SearchCustomersResponse> {
    return this.searchService.searchCustomers(request);
  }
}
