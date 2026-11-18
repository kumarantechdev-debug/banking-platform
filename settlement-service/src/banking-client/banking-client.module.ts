import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { join } from 'node:path';
import { BankingClientService } from './banking-client.service';

@Module({
  imports: [
    ConfigModule,
    ClientsModule.registerAsync([
      {
        name: 'BANKING_SERVICE',
        imports: [ConfigModule],
        inject: [ConfigService],
        useFactory: (configService: ConfigService) => ({
          transport: Transport.GRPC,
          options: {
            url: configService.get<string>('BANKING_SERVICE_URL', 'localhost:50052'),
            package: 'banking',
            protoPath: join(process.cwd(), 'proto', 'banking.proto'),
            loader: {
              keepCase: true,
              longs: Number,
              defaults: true,
              arrays: true,
            },
          },
        }),
      },
    ]),
  ],
  providers: [BankingClientService],
  exports: [BankingClientService],
})
export class BankingClientModule {}
