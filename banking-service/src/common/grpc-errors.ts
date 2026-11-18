import { status } from '@grpc/grpc-js';
import { RpcException } from '@nestjs/microservices';

export function grpcError(code: number, message: string): RpcException {
  return new RpcException({ code, message });
}

export function driverError(error: unknown): {
  code?: string;
  errno?: number;
} {
  if (typeof error !== 'object' || error === null) {
    return {};
  }

  const candidate =
    'driverError' in error && typeof error.driverError === 'object'
      ? error.driverError
      : error;
  if (candidate === null || typeof candidate !== 'object') {
    return {};
  }

  const record = candidate as Record<string, unknown>;
  return {
    code: typeof record.code === 'string' ? record.code : undefined,
    errno: typeof record.errno === 'number' ? record.errno : undefined,
  };
}

export function mapDatabaseError(error: unknown): RpcException {
  const database = driverError(error);
  if (
    database.code === 'ER_LOCK_DEADLOCK' ||
    database.code === 'ER_LOCK_WAIT_TIMEOUT' ||
    database.errno === 1213 ||
    database.errno === 1205
  ) {
    return grpcError(
      status.RESOURCE_EXHAUSTED,
      'The transfer could not be completed due to database contention. Retry the request.',
    );
  }

  if (
    database.code === 'ECONNREFUSED' ||
    database.code === 'PROTOCOL_CONNECTION_LOST' ||
    database.code === 'ETIMEDOUT'
  ) {
    return grpcError(status.UNAVAILABLE, 'Banking database is unavailable.');
  }

  return grpcError(
    status.INTERNAL,
    'The banking operation could not be completed.',
  );
}

export function isDuplicateEntry(error: unknown): boolean {
  const database = driverError(error);
  return database.code === 'ER_DUP_ENTRY' || database.errno === 1062;
}
