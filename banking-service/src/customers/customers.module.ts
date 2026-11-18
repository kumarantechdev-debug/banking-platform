import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { resolve } from 'node:path';
import { CustomerClientService } from './customer-client.service';

@Module({
  imports: [
    ClientsModule.registerAsync([
      {
        name: 'CUSTOMER_SERVICE',
        inject: [ConfigService],
        useFactory: (config: ConfigService) => ({
          transport: Transport.GRPC,
          options: {
            package: 'customer',
            protoPath: resolve(
              process.cwd(),
              config.get<string>(
                'CUSTOMER_PROTO_PATH',
                '../customer-service/proto/customer.proto',
              ),
            ),
            url: config.get<string>('CUSTOMER_SERVICE_URL', '127.0.0.1:50051'),
            loader: {
              keepCase: false,
              longs: String,
              enums: String,
              defaults: true,
              oneofs: true,
            },
          },
        }),
      },
    ]),
  ],
  providers: [CustomerClientService],
  exports: [CustomerClientService],
})
export class CustomersModule {}
