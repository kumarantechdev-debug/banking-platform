import 'dotenv/config';
import { DataSource } from 'typeorm';
import { Statement } from './entities/statement.entity';
import { StatementTransaction } from './entities/statement-transaction.entity';

export const AppDataSource = new DataSource({
  type: 'mysql',
  host: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT ?? 3306),
  username: process.env.DB_USERNAME ?? 'root',
  password: process.env.DB_PASSWORD ?? '',
  database: process.env.DB_DATABASE ?? 'statement_db',
  entities: [Statement, StatementTransaction],
  migrations: [__dirname + '/migrations/*{.ts,.js}'],
  synchronize: false,
  migrationsRun: false,
  logging: false,
  charset: 'utf8mb4_unicode_ci',
});
