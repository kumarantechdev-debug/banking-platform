import { join } from 'node:path';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import {
  ClientsModule,
  Transport,
  type ClientOptions,
} from '@nestjs/microservices';

export const CUSTOMER_GRPC_CLIENT = 'CUSTOMER_GRPC_CLIENT';
export const BANKING_GRPC_CLIENT = 'BANKING_GRPC_CLIENT';
export const SEARCH_GRPC_CLIENT = 'SEARCH_GRPC_CLIENT';
export const STATEMENT_GRPC_CLIENT = 'STATEMENT_GRPC_CLIENT';
export const SETTLEMENT_GRPC_CLIENT = 'SETTLEMENT_GRPC_CLIENT';

function grpcClientOptions(
  config: ConfigService,
  service: string,
  defaultPort: number,
): ClientOptions {
  const host = config.get<string>(`${service}_GRPC_HOST`, 'localhost');
  const port = config.get<string>(`${service}_GRPC_PORT`, String(defaultPort));

  return {
    transport: Transport.GRPC,
    options: {
      package: service.toLowerCase(),
      protoPath: join(import.meta.dirname, '..', 'proto', `${service.toLowerCase()}.proto`),
      url: `${host}:${port}`,
      loader: {
        keepCase: false,
        longs: String,
        enums: String,
        defaults: true,
        oneofs: true,
      },
    },
  };
}

@Module({
  imports: [
    ClientsModule.registerAsync([
      {
        name: CUSTOMER_GRPC_CLIENT,
        imports: [ConfigModule],
        inject: [ConfigService],
        useFactory: (config: ConfigService) =>
          grpcClientOptions(config, 'CUSTOMER', 50051),
      },
      {
        name: BANKING_GRPC_CLIENT,
        imports: [ConfigModule],
        inject: [ConfigService],
        useFactory: (config: ConfigService) =>
          grpcClientOptions(config, 'BANKING', 50052),
      },
      {
        name: SEARCH_GRPC_CLIENT,
        imports: [ConfigModule],
        inject: [ConfigService],
        useFactory: (config: ConfigService) =>
          grpcClientOptions(config, 'SEARCH', 50053),
      },
      {
        name: STATEMENT_GRPC_CLIENT,
        imports: [ConfigModule],
        inject: [ConfigService],
        useFactory: (config: ConfigService) =>
          grpcClientOptions(config, 'STATEMENT', 50054),
      },
      {
        name: SETTLEMENT_GRPC_CLIENT,
        imports: [ConfigModule],
        inject: [ConfigService],
        useFactory: (config: ConfigService) =>
          grpcClientOptions(config, 'SETTLEMENT', 50055),
      },
    ]),
  ],
  exports: [ClientsModule],
})
export class GrpcClientsModule {}
