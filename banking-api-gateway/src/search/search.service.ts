import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import type { ClientGrpc } from '@nestjs/microservices';
import { firstValueFrom, type Observable } from 'rxjs';
import { SEARCH_GRPC_CLIENT } from '../grpc/grpc-clients.module.js';
import { SearchCustomersDto } from './search.dto.js';

export interface SearchResponse {
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

interface SearchGrpcClient {
  searchCustomers(request: SearchCustomersDto): Observable<SearchResponse>;
}

@Injectable()
export class SearchService implements OnModuleInit {
  private searchClient!: SearchGrpcClient;

  constructor(
    @Inject(SEARCH_GRPC_CLIENT) private readonly client: ClientGrpc,
  ) {}

  onModuleInit(): void {
    this.searchClient = this.client.getService<SearchGrpcClient>('SearchService');
  }

  searchCustomers(query: SearchCustomersDto): Promise<SearchResponse> {
    return firstValueFrom(this.searchClient.searchCustomers(query));
  }
}
