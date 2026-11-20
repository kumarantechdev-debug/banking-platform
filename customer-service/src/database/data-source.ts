import { DataSource } from 'typeorm';
import { Customer } from '../customer/entities/customer.entity.js';
import { CreateCustomers1794901765883 } from './migrations/1794901765883-CreateCustomers.js';
import { AddCustomersCreatedAtIndex1794910000000 } from './migrations/1794910000000-AddCustomersCreatedAtIndex.js';
import { AddPasswordHashToCustomers1794920000000 } from './migrations/1794920000000-AddPasswordHashToCustomers.js';
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
  migrations: [
    CreateCustomers1794901765883,
    AddCustomersCreatedAtIndex1794910000000,
    AddPasswordHashToCustomers1794920000000,
  ],
});
