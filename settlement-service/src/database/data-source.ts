import { config } from 'dotenv';
import { DataSource } from 'typeorm';
import { SettlementAuditLog } from '../settlement-audit-log/entities/settlement-audit-log.entity';
import { SettlementJob } from '../settlement-job/entities/settlement-job.entity';
import { SettlementTransaction } from '../settlement-transaction/entities/settlement-transaction.entity';
import { SettlementJobs1710000000000 } from './migrations/1710000000000-SettlementJobs';
import { SettlementTransactions1710000000001 } from './migrations/1710000000001-SettlementTransactions';
import { SettlementAuditLogs1710000000002 } from './migrations/1710000000002-SettlementAuditLogs';

config();

export const AppDataSource = new DataSource({
  type: 'mysql',
  host: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT ?? 3306),
  username: process.env.DB_USERNAME ?? 'root',
  password: process.env.DB_PASSWORD ?? '',
  database: process.env.DB_DATABASE ?? 'settlement_db',
  entities: [SettlementJob, SettlementTransaction, SettlementAuditLog],
  migrations: [
    SettlementJobs1710000000000,
    SettlementTransactions1710000000001,
    SettlementAuditLogs1710000000002,
  ],
  synchronize: false,
  logging: false,
});
