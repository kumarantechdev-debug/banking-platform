import { DataSource } from 'typeorm';
import { Customer } from '../customer/entities/customer.entity.js';
import { createDatabaseConnectionOptions } from './database.config.js';

process.loadEnvFile();

function getEnvironmentValue(key: string): string {
  const value = process.env[key];

  if (value === undefined || value.length === 0) {
    throw new Error(`Configuration key "${key}" does not exist`);
  }

  return value;
}

export default new DataSource({
  ...createDatabaseConnectionOptions(getEnvironmentValue),
  entities: [Customer],
  migrations: [`${import.meta.dirname}/migrations/*{.ts,.js}`],
});
