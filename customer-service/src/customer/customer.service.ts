import { status } from '@grpc/grpc-js';
import bcrypt from 'bcrypt';
import { Injectable, Logger } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateCustomerDto } from './dto/create-customer.dto.js';
import { GetCustomersDto } from './dto/get-customers.dto.js';
import { UpdateCustomerDto } from './dto/update-customer.dto.js';
import { Customer } from './entities/customer.entity.js';

const SORT_COLUMNS = {
  createdAt: 'customer.createdAt',
  name: 'customer.name',
  mobile: 'customer.mobile',
  city: 'customer.city',
  state: 'customer.state',
  status: 'customer.status',
} as const;

const UNAVAILABLE_DATABASE_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'PROTOCOL_CONNECTION_LOST',
]);

@Injectable()
export class CustomerService {
  private readonly logger = new Logger(CustomerService.name);

  constructor(
    @InjectRepository(Customer)
    private readonly customerRepository: Repository<Customer>,
  ) {}

  async createCustomer(dto: CreateCustomerDto): Promise<Customer> {
    try {
      const existingCustomer = await this.customerRepository.findOneBy({
        mobile: dto.mobile,
      });

      if (existingCustomer) {
        throw this.duplicateMobileException();
      }

      if (Buffer.byteLength(dto.password, 'utf8') > 72) {
        throw invalidPasswordException();
      }

      const passwordHash = await bcrypt.hash(dto.password, 10);
      const customer = this.customerRepository.create({
        name: dto.name,
        mobile: dto.mobile,
        city: dto.city,
        state: dto.state,
        status: 'ACTIVE',
        passwordHash,
      });

      return await this.customerRepository.save(customer);
    } catch (error) {
      if (error instanceof RpcException) {
        throw error;
      }

      if (getDriverErrorCode(error) === 'ER_DUP_ENTRY') {
        throw this.duplicateMobileException();
      }

      throw this.databaseException('create customer', error);
    }
  }

  async getCustomer(id: number): Promise<Customer> {
    try {
      const customer = await this.customerRepository.findOneBy({ id });
      if (!customer) {
        throw this.customerNotFoundException();
      }
      return customer;
    } catch (error) {
      if (error instanceof RpcException) {
        throw error;
      }
      throw this.databaseException('retrieve customer', error);
    }
  }

  async verifyCustomerCredentials(
    mobile: string,
    password: string,
  ): Promise<{
    customerId: number;
    mobile: string;
    status: Customer['status'];
    authenticated: true;
  }> {
    try {
      const customer = await this.customerRepository.findOneBy({ mobile });
      if (
        !customer?.passwordHash ||
        Buffer.byteLength(password, 'utf8') > 72 ||
        !(await bcrypt.compare(password, customer.passwordHash))
      ) {
        throw this.invalidCredentialsException();
      }

      return {
        customerId: customer.id,
        mobile: customer.mobile,
        status: customer.status,
        authenticated: true,
      };
    } catch (error) {
      if (error instanceof RpcException) {
        throw error;
      }
      throw this.databaseException('verify customer credentials', error);
    }
  }

  async getCustomers(filters: GetCustomersDto): Promise<{
    customers: Customer[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const { page, limit } = filters;

    try {
      const query = this.customerRepository.createQueryBuilder('customer');

      addLikeFilter(query, 'customer.name', 'name', filters.name);
      addLikeFilter(query, 'customer.mobile', 'mobile', filters.mobile);
      addLikeFilter(query, 'customer.city', 'city', filters.city);
      addLikeFilter(query, 'customer.state', 'state', filters.state);

      if (filters.status) {
        query.andWhere('customer.status = :status', {
          status: filters.status,
        });
      }

      if (filters.fromDate) {
        query.andWhere('customer.createdAt >= :fromDate', {
          fromDate: new Date(filters.fromDate),
        });
      }

      if (filters.toDate) {
        const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(filters.toDate);
        const toDate = new Date(filters.toDate);

        if (dateOnly) {
          toDate.setUTCDate(toDate.getUTCDate() + 1);
          query.andWhere('customer.createdAt < :toDate', { toDate });
        } else {
          query.andWhere('customer.createdAt <= :toDate', { toDate });
        }
      }

      const sortBy = filters.sortBy ?? 'createdAt';
      const sortOrder = filters.sortOrder ?? 'DESC';
      query
        .orderBy(SORT_COLUMNS[sortBy], sortOrder)
        .skip((page - 1) * limit)
        .take(limit);

      const [customers, total] = await query.getManyAndCount();
      return {
        customers,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      };
    } catch (error) {
      throw this.databaseException('retrieve customers', error);
    }
  }

  async updateCustomer(dto: UpdateCustomerDto): Promise<Customer> {
    try {
      const customer = await this.customerRepository.findOneBy({ id: dto.id });
      if (!customer) {
        throw this.customerNotFoundException();
      }

      if (dto.mobile && dto.mobile !== customer.mobile) {
        const existingCustomer = await this.customerRepository.findOneBy({
          mobile: dto.mobile,
        });

        if (existingCustomer && existingCustomer.id !== customer.id) {
          throw this.duplicateMobileException();
        }
      }

      if (dto.name !== undefined) customer.name = dto.name;
      if (dto.mobile !== undefined) customer.mobile = dto.mobile;
      if (dto.city !== undefined) customer.city = dto.city;
      if (dto.state !== undefined) customer.state = dto.state;
      if (dto.status !== undefined) customer.status = dto.status;

      return await this.customerRepository.save(customer);
    } catch (error) {
      if (error instanceof RpcException) {
        throw error;
      }

      if (getDriverErrorCode(error) === 'ER_DUP_ENTRY') {
        throw this.duplicateMobileException();
      }

      throw this.databaseException('update customer', error);
    }
  }

  async deleteCustomer(id: number): Promise<{
    success: boolean;
    message: string;
  }> {
    try {
      const result = await this.customerRepository.delete({ id });
      if (!result.affected) {
        throw this.customerNotFoundException();
      }

      return { success: true, message: 'Customer deleted successfully' };
    } catch (error) {
      if (error instanceof RpcException) {
        throw error;
      }
      throw this.databaseException('delete customer', error);
    }
  }

  private duplicateMobileException(): RpcException {
    return new RpcException({
      code: status.ALREADY_EXISTS,
      message: 'A customer with this mobile number already exists',
    });
  }

  private customerNotFoundException(): RpcException {
    return new RpcException({
      code: status.NOT_FOUND,
      message: 'Customer not found',
    });
  }

  private invalidCredentialsException(): RpcException {
    return new RpcException({
      code: status.UNAUTHENTICATED,
      message: 'Invalid mobile or password',
    });
  }

  private databaseException(operation: string, error: unknown): RpcException {
    const errorCode = getDriverErrorCode(error);
    this.logger.error(
      `Failed to ${operation}${errorCode ? ` (${errorCode})` : ''}`,
    );

    const unavailable =
      errorCode !== undefined && UNAVAILABLE_DATABASE_CODES.has(errorCode);
    return new RpcException({
      code: unavailable ? status.UNAVAILABLE : status.INTERNAL,
      message: unavailable
        ? 'Customer database is unavailable'
        : `Unable to ${operation}`,
    });
  }
}

function invalidPasswordException(): RpcException {
  return new RpcException({
    code: status.INVALID_ARGUMENT,
    message: 'password must be at most 72 bytes',
  });
}

function addLikeFilter(
  query: ReturnType<Repository<Customer>['createQueryBuilder']>,
  column: string,
  parameter: string,
  value: string | undefined,
): void {
  const search = value?.trim();
  if (!search) {
    return;
  }

  const escapedSearch = search.replace(/[!%_]/g, '!$&');
  query.andWhere(`${column} LIKE :${parameter} ESCAPE '!'`, {
    [parameter]: `${escapedSearch}%`,
  });
}

function getDriverErrorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null) {
    return undefined;
  }

  if ('code' in error && typeof error.code === 'string') {
    return error.code;
  }

  if ('driverError' in error) {
    return getDriverErrorCode(error.driverError);
  }

  return undefined;
}
