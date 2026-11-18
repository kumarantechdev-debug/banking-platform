import { ConfigService } from '@nestjs/config';
import type { TypeOrmModuleOptions } from '@nestjs/typeorm';
import type { DataSourceOptions } from 'typeorm';

export function createDatabaseConnectionOptions(
  getValue: (key: string) => string,
): Extract<DataSourceOptions, { type: 'mysql' | 'mariadb' }> {
  const port = Number(getValue('DB_PORT'));

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('DB_PORT must be an integer between 1 and 65535');
  }

  return {
    type: 'mysql',
    host: getValue('DB_HOST'),
    port,
    username: getValue('DB_USERNAME'),
    password: getValue('DB_PASSWORD'),
    database: getValue('DB_DATABASE'),
    timezone: 'Z',
    synchronize: false,
  };
}

export function createDatabaseOptions(
  configService: ConfigService,
): TypeOrmModuleOptions {
  return {
    ...createDatabaseConnectionOptions((key) =>
      configService.getOrThrow<string>(key),
    ),
    autoLoadEntities: true,
    retryAttempts: 5,
    retryDelay: 3000,
    verboseRetryLog: true,
  };
}
