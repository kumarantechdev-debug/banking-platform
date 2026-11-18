import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { createObserveModule } from '@nestjs/observe';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccountsModule } from './accounts/accounts.module';
import { InitialBankingSchema1710000000000 } from './database/migrations/1710000000000-InitialBankingSchema';
import { AlignBankingSchema1794930000000 } from './database/migrations/1794930000000-AlignBankingSchema';
import { CreateBalanceLedger1800000000000 } from './database/migrations/1800000000000-CreateBalanceLedger';
import { AddTransferSettlementStatus1810000000000 } from './database/migrations/1810000000000-AddTransferSettlementStatus';
import { TransfersModule } from './transfers/transfers.module';

export const { ObserveModule, ObserveInstrument } = createObserveModule();

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ObserveModule.forRoot({
      appKey: process.env.OBSERVE_APP_KEY ?? 'YOUR_APP_KEY',
      appSecret: process.env.OBSERVE_APP_SECRET ?? 'YOUR_APP_SECRET',
      serviceId: 'banking-service',
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'mysql' as const,
        host: config.getOrThrow<string>('DB_HOST'),
        port: Number(config.get<string>('DB_PORT', '3306')),
        username: config.getOrThrow<string>('DB_USERNAME'),
        password: config.getOrThrow<string>('DB_PASSWORD'),
        database: bankingDatabase(config.getOrThrow<string>('DB_DATABASE')),
        autoLoadEntities: true,
        synchronize: false,
        migrationsRun: false,
        migrations: [
          InitialBankingSchema1710000000000,
          AlignBankingSchema1794930000000,
          CreateBalanceLedger1800000000000,
          AddTransferSettlementStatus1810000000000,
        ],
      }),
    }),
    AccountsModule,
    TransfersModule,
  ],
})
export class AppModule {}

function bankingDatabase(database: string): string {
  if (database !== 'banking_db') {
    throw new Error('DB_DATABASE must be banking_db.');
  }
  return database;
}
