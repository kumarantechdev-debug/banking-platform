import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { createObserveModule } from '@nestjs/observe';
import { BankingModule } from './banking/banking.module.js';
import { CustomersModule } from './customers/customers.module.js';
import { SearchModule } from './search/search.module.js';
import { SettlementsModule } from './settlements/settlements.module.js';
import { StatementsModule } from './statements/statements.module.js';
import { HealthModule } from './health/health.module.js';
import { AuthModule } from './auth/auth.module.js';

export const { ObserveModule, ObserveInstrument } = createObserveModule();

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }),
    // Distributed tracing, auto-correlated logs, request/job metrics, error
    // telemetry, alarms, and more — out of the box. Sign up at https://observe.nestjs.com,
    // then run `npx @nestjs/observe link` to write your key pair into .env.
    ObserveModule.forRoot({
      appKey: process.env.OBSERVE_APP_KEY ?? 'YOUR_APP_KEY',
      appSecret: process.env.OBSERVE_APP_SECRET ?? 'YOUR_APP_SECRET',
      serviceId: 'banking-api-gateway',
    }),
    AuthModule,
    HealthModule,
    CustomersModule,
    BankingModule,
    SearchModule,
    StatementsModule,
    SettlementsModule,
  ],
})
export class AppModule {}
