import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { createObserveModule } from '@nestjs/observe';
import { BankingClientModule } from './banking-client/banking-client.module';
import { SettlementGrpcController } from './grpc/settlement.grpc.controller';
import { SettlementJob } from './settlement-job/entities/settlement-job.entity';
import { SettlementJobModule } from './settlement-job/settlement-job.module';
import { SettlementTransaction } from './settlement-transaction/entities/settlement-transaction.entity';
import { SettlementTransactionModule } from './settlement-transaction/settlement-transaction.module';
import { SchedulerModule } from './scheduler/scheduler.module';
import { SettlementAuditLog } from './settlement-audit-log/entities/settlement-audit-log.entity';
import { ReportsModule } from './reports/reports.module';
import { SettlementJobs1710000000000 } from './database/migrations/1710000000000-SettlementJobs';
import { SettlementTransactions1710000000001 } from './database/migrations/1710000000001-SettlementTransactions';
import { SettlementAuditLogs1710000000002 } from './database/migrations/1710000000002-SettlementAuditLogs';

export const { ObserveModule, ObserveInstrument } = createObserveModule();

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'mysql',
        host: configService.get<string>('DB_HOST', 'localhost'),
        port: configService.get<number>('DB_PORT', 3306),
        username: configService.get<string>('DB_USERNAME', 'root'),
        password: configService.get<string>('DB_PASSWORD', ''),
        database: configService.get<string>('DB_DATABASE', 'settlement_db'),
        entities: [SettlementJob, SettlementTransaction, SettlementAuditLog],
        migrations: [
          SettlementJobs1710000000000,
          SettlementTransactions1710000000001,
          SettlementAuditLogs1710000000002,
        ],
        synchronize: false,
        migrationsRun: false,
        logging: false,
      }),
    }),
    ScheduleModule.forRoot(),
    // Distributed tracing, auto-correlated logs, request/job metrics, error
    // telemetry, alarms, and more — out of the box. Sign up at https://observe.nestjs.com,
    // then run `npx @nestjs/observe link` to write your key pair into .env.
    ObserveModule.forRoot({
      appKey: process.env.OBSERVE_APP_KEY ?? 'YOUR_APP_KEY',
      appSecret: process.env.OBSERVE_APP_SECRET ?? 'YOUR_APP_SECRET',
      serviceId: 'settlement-service',
    }),
    BankingClientModule,
    SettlementJobModule,
    SettlementTransactionModule,
    SchedulerModule,
    ReportsModule,
  ],
  controllers: [SettlementGrpcController],
})
export class AppModule {}
