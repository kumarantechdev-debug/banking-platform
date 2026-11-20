import 'dotenv/config';
import { DataSource } from 'typeorm';
import { Account } from './accounts/account.entity';
import { TransferAudit } from './transfers/transfer-audit.entity';
import { Transfer } from './transfers/transfer.entity';
import { AccountBalanceLedgerEntry } from './ledger/account-balance-ledger-entry.entity';
import { InitialBankingSchema1710000000000 } from './database/migrations/1710000000000-InitialBankingSchema';
import { AlignBankingSchema1794930000000 } from './database/migrations/1794930000000-AlignBankingSchema';
import { CreateBalanceLedger1800000000000 } from './database/migrations/1800000000000-CreateBalanceLedger';
import { AddTransferSettlementStatus1810000000000 } from './database/migrations/1810000000000-AddTransferSettlementStatus';

export default new DataSource({
  type: 'mysql',
  host: required('DB_HOST'),
  port: Number(process.env.DB_PORT ?? 3306),
  username: required('DB_USERNAME'),
  password: required('DB_PASSWORD'),
  database: bankingDatabase(),
  entities: [Account, Transfer, TransferAudit, AccountBalanceLedgerEntry],
  synchronize: false,
  migrations: [
    InitialBankingSchema1710000000000,
    AlignBankingSchema1794930000000,
    CreateBalanceLedger1800000000000,
    AddTransferSettlementStatus1810000000000,
  ],
});

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} must be configured.`);
  }
  return value;
}

function bankingDatabase(): string {
  const database = required('DB_DATABASE');
  if (database !== 'banking_db') {
    throw new Error('DB_DATABASE must be banking_db.');
  }
  return database;
}
