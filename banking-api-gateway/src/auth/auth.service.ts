import { status as grpcStatus } from '@grpc/grpc-js';
import {
  Inject,
  Injectable,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { ClientGrpc } from '@nestjs/microservices';
import { firstValueFrom, type Observable } from 'rxjs';
import { CUSTOMER_GRPC_CLIENT } from '../grpc/grpc-clients.module.js';
import { LoginDto, type LoginToken } from './auth.dto.js';

interface VerifyCustomerCredentialsResponse {
  customerId: number;
  mobile: string;
  status: string;
  authenticated: boolean;
}

interface CustomerGrpcClient {
  verifyCustomerCredentials(request: {
    mobile: string;
    password: string;
  }): Observable<VerifyCustomerCredentialsResponse>;
}

@Injectable()
export class AuthService implements OnModuleInit {
  private customers!: CustomerGrpcClient;

  constructor(
    @Inject(CUSTOMER_GRPC_CLIENT) private readonly customerClient: ClientGrpc,
    private readonly jwt: JwtService,
  ) {}

  onModuleInit(): void {
    this.customers =
      this.customerClient.getService<CustomerGrpcClient>('CustomerService');
  }

  async login(dto: LoginDto): Promise<LoginToken> {
    let result: VerifyCustomerCredentialsResponse;

    try {
      result = await firstValueFrom(
        this.customers.verifyCustomerCredentials({
          mobile: dto.mobile,
          password: dto.password,
        }),
      );
    } catch (error) {
      if (isUnauthenticatedGrpcError(error)) {
        throw new UnauthorizedException('Invalid credentials');
      }
      throw error;
    }

    if (
      result.authenticated !== true ||
      !Number.isSafeInteger(result.customerId) ||
      result.customerId <= 0 ||
      !result.mobile
    ) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const accessToken = await this.jwt.signAsync({
      sub: result.customerId,
      customerId: result.customerId,
      mobile: result.mobile,
    });

    return { accessToken };
  }
}

function isUnauthenticatedGrpcError(error: unknown): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    error.code === grpcStatus.UNAUTHENTICATED
  );
}
