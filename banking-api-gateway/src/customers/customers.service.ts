import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import type { ClientGrpc } from '@nestjs/microservices';
import { firstValueFrom, type Observable } from 'rxjs';
import { CUSTOMER_GRPC_CLIENT } from '../grpc/grpc-clients.module.js';
import { CreateCustomerDto, ListCustomersDto } from './customer.dto.js';

export interface CustomerResponse {
  id: number;
  name: string;
  mobile: string;
  city: string;
  state: string;
  status: string;
}

export interface CustomerListResponse {
  customers: CustomerResponse[];
  total: number;
  page: number;
  limit: number;
}

interface CustomerGrpcClient {
  createCustomer(
    request: CreateCustomerDto,
  ): Observable<CustomerResponse>;
  getCustomer(request: { id: number }): Observable<CustomerResponse>;
  getCustomers(request: ListCustomersDto): Observable<CustomerListResponse>;
}

@Injectable()
export class CustomersService implements OnModuleInit {
  private customers!: CustomerGrpcClient;

  constructor(
    @Inject(CUSTOMER_GRPC_CLIENT) private readonly customerClient: ClientGrpc,
  ) {}

  onModuleInit(): void {
    this.customers =
      this.customerClient.getService<CustomerGrpcClient>('CustomerService');
  }

  create(dto: CreateCustomerDto): Promise<CustomerResponse> {
    return firstValueFrom(this.customers.createCustomer(dto));
  }

  getById(id: number): Promise<CustomerResponse> {
    return firstValueFrom(this.customers.getCustomer({ id }));
  }

  list(query: ListCustomersDto): Promise<CustomerListResponse> {
    return firstValueFrom(this.customers.getCustomers(query));
  }
}
