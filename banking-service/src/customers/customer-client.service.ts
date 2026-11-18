import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { status } from '@grpc/grpc-js';
import { RpcException } from '@nestjs/microservices';
import type { ClientGrpc } from '@nestjs/microservices';
import { firstValueFrom, Observable, timeout } from 'rxjs';
import { grpcError } from '../common/grpc-errors';

interface CustomerResponse {
  id: number;
}

interface CustomerServiceClient {
  getCustomer(request: { id: number }): Observable<CustomerResponse>;
}

@Injectable()
export class CustomerClientService implements OnModuleInit {
  private customerService!: CustomerServiceClient;

  constructor(
    @Inject('CUSTOMER_SERVICE') private readonly grpcClient: ClientGrpc,
  ) {}

  onModuleInit(): void {
    this.customerService =
      this.grpcClient.getService<CustomerServiceClient>('CustomerService');
  }

  async assertCustomerExists(customerId: number): Promise<void> {
    try {
      const customer = await firstValueFrom(
        this.customerService
          .getCustomer({ id: customerId })
          .pipe(timeout(5000)),
      );
      if (!customer || customer.id !== customerId) {
        throw grpcError(status.NOT_FOUND, 'Customer not found.');
      }
    } catch (error) {
      if (error instanceof RpcException) {
        throw error;
      }

      const grpcCode =
        typeof error === 'object' && error !== null && 'code' in error
          ? error.code
          : undefined;
      if (grpcCode === status.NOT_FOUND) {
        throw grpcError(status.NOT_FOUND, 'Customer not found.');
      }
      if (
        grpcCode === status.UNAVAILABLE ||
        grpcCode === status.DEADLINE_EXCEEDED
      ) {
        throw grpcError(status.UNAVAILABLE, 'Customer service is unavailable.');
      }
      if (error instanceof Error && error.name === 'TimeoutError') {
        throw grpcError(status.UNAVAILABLE, 'Customer service is unavailable.');
      }
      throw grpcError(status.INTERNAL, 'Customer validation failed.');
    }
  }
}
