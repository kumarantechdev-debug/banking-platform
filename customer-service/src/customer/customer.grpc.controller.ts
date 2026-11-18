import { Controller } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { CreateCustomerDto } from './dto/create-customer.dto.js';
import { DeleteCustomerDto } from './dto/delete-customer.dto.js';
import { GetCustomerDto } from './dto/get-customer.dto.js';
import { GetCustomersDto } from './dto/get-customers.dto.js';
import {
  invalidArgument,
  validateGrpcRequest,
} from './dto/validate-grpc-request.js';
import { UpdateCustomerDto } from './dto/update-customer.dto.js';
import { VerifyCustomerCredentialsDto } from './dto/verify-customer-credentials.dto.js';
import { Customer } from './entities/customer.entity.js';
import { CustomerService } from './customer.service.js';

type CustomerResponse = Pick<
  Customer,
  'id' | 'name' | 'mobile' | 'city' | 'state' | 'status'
>;

type GetCustomersResponse = {
  customers: CustomerResponse[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

type VerifyCustomerCredentialsResponse = {
  customerId: number;
  mobile: string;
  status: Customer['status'];
  authenticated: true;
};

@Controller()
export class CustomerGrpcController {
  constructor(private readonly customerService: CustomerService) {}

  @GrpcMethod('CustomerService', 'CreateCustomer')
  async createCustomer(request: unknown): Promise<CustomerResponse> {
    const dto = await validateGrpcRequest(CreateCustomerDto, request);
    return this.toCustomerResponse(
      await this.customerService.createCustomer(dto),
    );
  }

  @GrpcMethod('CustomerService', 'VerifyCustomerCredentials')
  async verifyCustomerCredentials(
    request: unknown,
  ): Promise<VerifyCustomerCredentialsResponse> {
    const dto = await validateGrpcRequest(
      VerifyCustomerCredentialsDto,
      request,
    );
    return this.customerService.verifyCustomerCredentials(
      dto.mobile,
      dto.password,
    );
  }

  @GrpcMethod('CustomerService', 'GetCustomer')
  async getCustomer(request: unknown): Promise<CustomerResponse> {
    const dto = await validateGrpcRequest(GetCustomerDto, request);
    return this.toCustomerResponse(
      await this.customerService.getCustomer(dto.id),
    );
  }

  @GrpcMethod('CustomerService', 'GetCustomers')
  async getCustomers(request: unknown): Promise<GetCustomersResponse> {
    const dto = await validateGrpcRequest(GetCustomersDto, request);

    if (
      dto.fromDate &&
      dto.toDate &&
      hasInvalidDateRange(dto.fromDate, dto.toDate)
    ) {
      throw invalidArgument('fromDate must be earlier than or equal to toDate');
    }

    const result = await this.customerService.getCustomers(dto);
    return {
      customers: result.customers.map((customer) =>
        this.toCustomerResponse(customer),
      ),
      total: result.total,
      page: result.page,
      limit: result.limit,
      totalPages: result.totalPages,
    };
  }

  @GrpcMethod('CustomerService', 'UpdateCustomer')
  async updateCustomer(request: unknown): Promise<CustomerResponse> {
    const dto = await validateGrpcRequest(UpdateCustomerDto, request);
    const hasUpdates = [
      dto.name,
      dto.mobile,
      dto.city,
      dto.state,
      dto.status,
    ].some((value) => value !== undefined);

    if (!hasUpdates) {
      throw invalidArgument('At least one customer field must be provided');
    }

    return this.toCustomerResponse(
      await this.customerService.updateCustomer(dto),
    );
  }

  @GrpcMethod('CustomerService', 'DeleteCustomer')
  async deleteCustomer(
    request: unknown,
  ): Promise<{ success: boolean; message: string }> {
    const dto = await validateGrpcRequest(DeleteCustomerDto, request);
    return this.customerService.deleteCustomer(dto.id);
  }

  private toCustomerResponse(customer: Customer): CustomerResponse {
    return {
      id: customer.id,
      name: customer.name,
      mobile: customer.mobile,
      city: customer.city,
      state: customer.state,
      status: customer.status,
    };
  }
}

function hasInvalidDateRange(fromDate: string, toDate: string): boolean {
  const from = Date.parse(fromDate);
  const to = new Date(toDate);

  if (/^\d{4}-\d{2}-\d{2}$/.test(toDate)) {
    to.setUTCDate(to.getUTCDate() + 1);
    return from >= to.getTime();
  }

  return from > to.getTime();
}
